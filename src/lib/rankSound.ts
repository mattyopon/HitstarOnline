// ───────────────────────────────────────────────────────────────────────────
// Synthesized rank entry fanfare (NO audio files — all Web Audio synthesis).
// Grandeur scales with tier: higher tier = more chord notes, longer arpeggio,
// brighter shimmer. Must be called only after a user gesture (the GameRoom sound
// gate sets soundOn). Output is scaled by the user's SE-volume setting.
// ───────────────────────────────────────────────────────────────────────────
import { isTier, tierIndex, type Tier } from "./rank";

export const SE_VOLUME_KEY = "hitstar_se_volume";

/** SE volume 0..1 from the user's setting (default 0.7). */
export function getSeVolume(): number {
  if (typeof window === "undefined") return 0.7;
  const v = Number(localStorage.getItem(SE_VOLUME_KEY));
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v / 100 : 0.7;
}

export function setSeVolume(percent: number): void {
  if (typeof window === "undefined") return;
  const v = Math.max(0, Math.min(100, Math.round(percent)));
  try {
    localStorage.setItem(SE_VOLUME_KEY, String(v));
  } catch {
    /* ignore */
  }
}

/** Play a tier-scaled entry fanfare. Cosmetic only — never throws. */
export function playRankEntrySound(tier?: string | null): void {
  if (!isTier(tier)) return;
  if (typeof window === "undefined") return;
  const seVol = getSeVolume();
  if (seVol <= 0) return; // muted
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;

  try {
    const idx = tierIndex(tier as Tier); // 0..6
    const ctx = new Ctx();
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.value = (0.18 + idx * 0.02) * seVol;
    master.connect(ctx.destination);

    // Major arpeggio (root, M3, P5, octave…), more notes for higher tiers.
    const root = 261.63 * Math.pow(2, idx / 12); // pitch rises with tier
    const semis = [0, 4, 7, 12, 16, 19, 24];
    const noteCount = 2 + idx; // wood 2 … challenger 8
    const step = 0.085 - idx * 0.005; // faster arpeggio higher up

    for (let i = 0; i < noteCount; i++) {
      const t0 = now + i * step;
      const freq = root * Math.pow(2, semis[i % semis.length] / 12);
      const osc = ctx.createOscillator();
      osc.type = idx < 3 ? "sine" : "triangle";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.9, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.55);
    }

    // High-tier shimmer: a bright octave bell on top.
    if (idx >= 4) {
      const t0 = now + 0.04;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = root * 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.25, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.95);
    }

    const total = now + noteCount * step + 1.0;
    setTimeout(() => ctx.close().catch(() => {}), Math.max(800, (total - now) * 1000));
  } catch {
    /* cosmetic only — never throw */
  }
}
