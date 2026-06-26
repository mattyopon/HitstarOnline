"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/clientApi";
import {
  DEFAULT_PEER_VOLUME,
  SIGNAL_EVENT,
  voiceTopic,
  type SignalMsg,
  type VoicePresence,
} from "@/lib/voice";
import type { ClientUser } from "@/hooks/useUser";

export interface VoicePeer {
  userId: string;
  name: string;
  /** Output volume 0–100 (HTMLAudioElement.volume). */
  volume: number;
  /** Remote-reported mute state. */
  muted: boolean;
  /** Best-effort speaking indicator from an analyser on the remote stream. */
  speaking: boolean;
  connected: boolean;
}

export interface VoiceApi {
  joined: boolean;
  connecting: boolean;
  micOn: boolean;
  speaking: boolean;
  error: string | null;
  peers: VoicePeer[];
  join: (listenOnly?: boolean) => Promise<void>;
  leave: () => void;
  toggleMic: () => Promise<void>;
  setVolume: (userId: string, volume: number) => void;
}

interface Peer {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  name: string;
  volume: number;
  muted: boolean;
  speaking: boolean;
  connected: boolean;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  analyser?: AnalyserNode;
  src?: MediaStreamAudioSourceNode;
}

const SPEAK_THRESHOLD = 0.045;

/**
 * WebRTC audio mesh for an in-room voice chat. Signaling rides a Supabase
 * Realtime PRIVATE channel; presence tracks who is in the call. Uses the
 * "perfect negotiation" pattern so mic toggles renegotiate cleanly and glare
 * is resolved deterministically (the peer with the larger id is "polite").
 *
 * Per-peer output volume is the plain HTMLAudioElement.volume (reliable on
 * mobile + desktop). Self-mute toggles the local track's `enabled`.
 */
export function useVoice(code: string, me: ClientUser | null): VoiceApi {
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<VoicePeer[]>([]);

  const meRef = useRef<ClientUser | null>(me);
  meRef.current = me;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);
  const peersRef = useRef<Map<string, Peer>>(new Map());
  const localStream = useRef<MediaStream | null>(null);
  const iceServers = useRef<RTCIceServer[]>([]);
  const audioCtx = useRef<AudioContext | null>(null);
  const localAnalyser = useRef<AnalyserNode | null>(null);
  const rafId = useRef<number | null>(null);
  const micOnRef = useRef(false);
  const volumePrefs = useRef<Map<string, number>>(new Map());

  const publish = useCallback(() => {
    setPeers(
      [...peersRef.current.entries()].map(([userId, p]) => ({
        userId,
        name: p.name,
        volume: p.volume,
        muted: p.muted,
        speaking: p.speaking,
        connected: p.connected,
      })),
    );
  }, []);

  const sendSignal = useCallback((msg: SignalMsg) => {
    channelRef.current?.send({ type: "broadcast", event: SIGNAL_EVENT, payload: msg });
  }, []);

  const trackPresence = useCallback(() => {
    const m = meRef.current;
    if (!m || !channelRef.current) return;
    const payload: VoicePresence = { userId: m.id, name: m.name, muted: !micOnRef.current };
    channelRef.current.track(payload);
  }, []);

  const ensureAudioCtx = useCallback(() => {
    if (!audioCtx.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx.current = new Ctx();
    }
    if (audioCtx.current.state === "suspended") audioCtx.current.resume().catch(() => {});
    return audioCtx.current;
  }, []);

  const attachAnalyser = useCallback(
    (stream: MediaStream, onPeer?: Peer) => {
      try {
        const ctx = ensureAudioCtx();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        if (onPeer) {
          onPeer.analyser = analyser;
          onPeer.src = src;
        } else {
          localAnalyser.current = analyser;
        }
      } catch {
        /* analyser is best-effort (some browsers restrict remote streams) */
      }
    },
    [ensureAudioCtx],
  );

  const createPeer = useCallback(
    (peerId: string, name: string): Peer => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;
      const m = meRef.current!;
      const pc = new RTCPeerConnection({ iceServers: iceServers.current });
      const audio = new Audio();
      audio.autoplay = true;
      // @ts-expect-error iOS-specific hint; harmless elsewhere
      audio.playsInline = true;
      const peer: Peer = {
        pc,
        audio,
        name,
        volume: volumePrefs.current.get(peerId) ?? DEFAULT_PEER_VOLUME,
        muted: false,
        speaking: false,
        connected: false,
        polite: m.id > peerId, // larger id = polite (rolls back on glare)
        makingOffer: false,
        ignoreOffer: false,
      };
      audio.volume = peer.volume / 100;

      // Publish our audio, or negotiate a recv-only line if we're listen-only.
      if (localStream.current) {
        for (const t of localStream.current.getAudioTracks()) pc.addTrack(t, localStream.current);
      } else {
        pc.addTransceiver("audio", { direction: "recvonly" });
      }

      pc.onnegotiationneeded = async () => {
        try {
          peer.makingOffer = true;
          await pc.setLocalDescription();
          sendSignal({ from: m.id, to: peerId, kind: "offer", sdp: pc.localDescription! });
        } catch {
          /* ignore */
        } finally {
          peer.makingOffer = false;
        }
      };
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) sendSignal({ from: m.id, to: peerId, kind: "ice", candidate: candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        const [stream] = e.streams;
        if (!stream) return;
        audio.srcObject = stream;
        audio.volume = peer.volume / 100;
        audio.play().catch(() => {});
        attachAnalyser(stream, peer);
      };
      pc.onconnectionstatechange = () => {
        peer.connected = pc.connectionState === "connected";
        if (["failed", "closed", "disconnected"].includes(pc.connectionState)) peer.connected = false;
        publish();
      };

      peersRef.current.set(peerId, peer);
      publish();
      return peer;
    },
    [sendSignal, attachAnalyser, publish],
  );

  const closePeer = useCallback(
    (peerId: string) => {
      const peer = peersRef.current.get(peerId);
      if (!peer) return;
      try {
        peer.pc.ontrack = null;
        peer.pc.onicecandidate = null;
        peer.pc.onnegotiationneeded = null;
        peer.pc.close();
      } catch {
        /* ignore */
      }
      try {
        peer.audio.srcObject = null;
      } catch {
        /* ignore */
      }
      peersRef.current.delete(peerId);
      publish();
    },
    [publish],
  );

  const handleSignal = useCallback(
    async (msg: SignalMsg) => {
      const m = meRef.current;
      if (!m || msg.to !== m.id) return;
      const peer = peersRef.current.get(msg.from) ?? createPeer(msg.from, msg.from);
      const pc = peer.pc;
      try {
        if (msg.kind === "offer" || msg.kind === "answer") {
          const desc = msg.sdp;
          if (!desc) return;
          const collision =
            desc.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
          peer.ignoreOffer = !peer.polite && collision;
          if (peer.ignoreOffer) return;
          await pc.setRemoteDescription(desc);
          if (desc.type === "offer") {
            await pc.setLocalDescription();
            sendSignal({ from: m.id, to: msg.from, kind: "answer", sdp: pc.localDescription! });
          }
        } else if (msg.kind === "ice" && msg.candidate) {
          try {
            await pc.addIceCandidate(msg.candidate);
          } catch (e) {
            if (!peer.ignoreOffer) throw e;
          }
        }
      } catch {
        /* signaling errors are non-fatal */
      }
    },
    [createPeer, sendSignal],
  );

  // Reconcile the mesh against the channel's presence state.
  const reconcile = useCallback(() => {
    const m = meRef.current;
    const ch = channelRef.current;
    if (!m || !ch) return;
    const state = ch.presenceState() as Record<string, VoicePresence[]>;
    const present = new Map<string, VoicePresence>();
    for (const arr of Object.values(state)) {
      const p = arr[0];
      if (p && p.userId && p.userId !== m.id) present.set(p.userId, p);
    }
    // Add new peers; the impolite side (smaller id) will drive the first offer.
    for (const [peerId, info] of present) {
      const existing = peersRef.current.get(peerId);
      if (!existing) createPeer(peerId, info.name);
      else {
        existing.name = info.name;
        existing.muted = info.muted;
      }
    }
    // Drop peers that left.
    for (const peerId of [...peersRef.current.keys()]) {
      if (!present.has(peerId)) closePeer(peerId);
    }
    publish();
  }, [createPeer, closePeer, publish]);

  // Speaking detection loop (local + remote), throttled via rAF.
  const startMeter = useCallback(() => {
    if (rafId.current != null) return;
    const buf = new Uint8Array(256);
    const rms = (an?: AnalyserNode | null) => {
      if (!an) return 0;
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / buf.length);
    };
    let lastSelf = false;
    const tick = () => {
      const self = micOnRef.current && rms(localAnalyser.current) > SPEAK_THRESHOLD;
      if (self !== lastSelf) {
        lastSelf = self;
        setSpeaking(self);
      }
      let changed = false;
      for (const peer of peersRef.current.values()) {
        const sp = rms(peer.analyser) > SPEAK_THRESHOLD;
        if (sp !== peer.speaking) {
          peer.speaking = sp;
          changed = true;
        }
      }
      if (changed) publish();
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
  }, [publish]);

  const join = useCallback(
    async (listenOnly = false) => {
      const m = meRef.current;
      if (!m || joined || connecting) return;
      setConnecting(true);
      setError(null);
      try {
        const { iceServers: ice } = await api<{ iceServers: RTCIceServer[] }>("/api/turn");
        iceServers.current = ice || [];

        if (!listenOnly) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
              video: false,
            });
            localStream.current = stream;
            micOnRef.current = true;
            setMicOn(true);
            attachAnalyser(stream);
          } catch {
            // Mic denied/unavailable → continue as listener.
            micOnRef.current = false;
            setMicOn(false);
            setError("マイクを使用できません。聞き専で参加します。");
          }
        }

        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        await supabase.realtime.setAuth(session?.access_token ?? null);

        const channel = supabase.channel(voiceTopic(code), {
          config: { private: true, broadcast: { self: false }, presence: { key: m.id } },
        });
        channelRef.current = channel;
        channel.on("broadcast", { event: SIGNAL_EVENT }, (payload) => {
          const msg = (payload as { payload?: SignalMsg }).payload;
          if (msg) handleSignal(msg);
        });
        channel.on("presence", { event: "sync" }, () => reconcile());
        channel.on("presence", { event: "leave" }, () => reconcile());
        await new Promise<void>((resolve) => {
          channel.subscribe((status) => {
            if (status === "SUBSCRIBED") {
              trackPresence();
              resolve();
            }
          });
        });

        startMeter();
        setJoined(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "通話に参加できませんでした");
      } finally {
        setConnecting(false);
      }
    },
    [code, joined, connecting, attachAnalyser, handleSignal, reconcile, trackPresence, startMeter],
  );

  const leave = useCallback(() => {
    for (const id of [...peersRef.current.keys()]) closePeer(id);
    if (channelRef.current) {
      try {
        createClient().removeChannel(channelRef.current);
      } catch {
        /* ignore */
      }
      channelRef.current = null;
    }
    if (localStream.current) {
      for (const t of localStream.current.getTracks()) t.stop();
      localStream.current = null;
    }
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    localAnalyser.current = null;
    micOnRef.current = false;
    setMicOn(false);
    setSpeaking(false);
    setJoined(false);
    setPeers([]);
  }, [closePeer]);

  const toggleMic = useCallback(async () => {
    const m = meRef.current;
    if (!m || !joined) return;
    // Already have a mic track → just flip enabled (mute/unmute).
    if (localStream.current) {
      const next = !micOnRef.current;
      for (const t of localStream.current.getAudioTracks()) t.enabled = next;
      micOnRef.current = next;
      setMicOn(next);
      trackPresence();
      return;
    }
    // Listen-only → acquire mic and renegotiate with every peer.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      localStream.current = stream;
      micOnRef.current = true;
      setMicOn(true);
      attachAnalyser(stream);
      for (const peer of peersRef.current.values()) {
        for (const t of stream.getAudioTracks()) peer.pc.addTrack(t, stream); // triggers renegotiation
      }
      trackPresence();
    } catch {
      setError("マイクを使用できません。");
    }
  }, [joined, attachAnalyser, trackPresence]);

  const setVolume = useCallback(
    (userId: string, volume: number) => {
      const v = Math.max(0, Math.min(100, volume));
      volumePrefs.current.set(userId, v);
      const peer = peersRef.current.get(userId);
      if (peer) {
        peer.volume = v;
        peer.audio.volume = v / 100;
      }
      publish();
    },
    [publish],
  );

  // Clean up on unmount.
  useEffect(() => {
    return () => leave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { joined, connecting, micOn, speaking, error, peers, join, leave, toggleMic, setVolume };
}
