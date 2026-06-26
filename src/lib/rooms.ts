// Server-side room orchestration: load/save game state with optimistic
// concurrency, manage membership, and resolve YouTube ids for mystery cards.
// Uses the service-role admin client (bypasses RLS). API-route use only.

import { createAdminClient } from "./supabase/admin";
import { getDeck, deckKey, searchQuery } from "./deck";
import { searchYouTubeId } from "./youtube";
import { recordTransitions } from "./stats";
import { FullGame, PlayerSeed, PublicState, SecretState } from "./protocol";
import {
  addPlayer,
  createLobby,
  currentSongId,
  needsTrackResolution,
  removePlayer,
} from "./engine";

export class ConflictError extends Error {}
export class NotFoundError extends Error {}

// Unambiguous alphabet (no O/0, I/1).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function genRoomCode(len = 4): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

interface LoadedRoom {
  id: string;
  version: number;
  game: FullGame;
}

export async function loadByCode(code: string): Promise<LoadedRoom | null> {
  const admin = createAdminClient();
  const { data: room, error } = await admin
    .from("rooms")
    .select("id, version, state")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  if (!room) return null;
  const { data: secretRow, error: e2 } = await admin
    .from("room_secrets")
    .select("secret")
    .eq("room_id", room.id)
    .maybeSingle();
  if (e2) throw e2;
  const game: FullGame = {
    public: room.state as PublicState,
    secret: (secretRow?.secret as SecretState) ?? { deck: [], drawPos: 0 },
  };
  return { id: room.id, version: room.version, game };
}

/** Fill in current.youtubeId for the mystery card if needed (network + cache). */
async function ensureTrackResolved(game: FullGame): Promise<void> {
  if (!needsTrackResolution(game)) return;
  const songId = currentSongId(game);
  if (songId === undefined || !game.public.current) return;
  const song = getDeck()[songId];
  if (!song) return;

  const admin = createAdminClient();
  const key = deckKey(song);
  const { data: cached } = await admin
    .from("track_cache")
    .select("youtube_id")
    .eq("key", key)
    .maybeSingle();

  let ytId = cached?.youtube_id ?? null;
  if (!ytId) {
    ytId = await searchYouTubeId(searchQuery(song));
    await admin
      .from("track_cache")
      .upsert({ key, youtube_id: ytId, updated_at: new Date().toISOString() });
  }
  game.public.current.youtubeId = ytId;
}

async function persist(roomId: string, expectedVersion: number, game: FullGame): Promise<void> {
  const admin = createAdminClient();
  // Single transactional RPC: CAS the rooms row AND upsert the secret atomically.
  const { data, error } = await admin.rpc("apply_room_state", {
    p_id: roomId,
    p_expected_version: expectedVersion,
    p_state: game.public,
    p_version: game.public.version,
    p_status: game.public.phase,
    p_secret: game.secret,
  });
  if (error) throw error;
  if (data !== true) throw new ConflictError("バージョン競合が発生しました");
}

/**
 * Apply a pure engine transition to a room and persist it with optimistic
 * concurrency. Throws GameError (from the engine) for invalid moves and
 * ConflictError if another writer won the race.
 */
const MAX_RETRIES = 5;

export async function mutateByCode(
  code: string,
  fn: (game: FullGame) => FullGame,
): Promise<FullGame> {
  let lastConflict: ConflictError | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const loaded = await loadByCode(code);
    if (!loaded) throw new NotFoundError("部屋が見つかりません");
    const expected = loaded.game.public.version;
    const prevPhase = loaded.game.public.phase;
    // The engine fn is pure; a GameError here is a real invalid move → propagate.
    const next = fn(loaded.game);
    if (next.public.version === expected) return next; // no-op transition
    await ensureTrackResolved(next);
    try {
      await persist(loaded.id, expected, next);
      // Best-effort stats recording (never throws): reveal accuracy on entering
      // reveal, and the final match result on entering gameover.
      await recordTransitions(loaded.id, prevPhase, next.public);
      return next;
    } catch (e) {
      if (e instanceof ConflictError) {
        lastConflict = e; // another writer won — reload and re-apply
        continue;
      }
      throw e;
    }
  }
  throw lastConflict ?? new ConflictError("バージョン競合が解消できませんでした");
}

// ─── Room lifecycle (insert / membership) ──────────────────────────────────--

export async function createRoom(
  seed: PlayerSeed,
  settings: Partial<PublicState["settings"]> = {},
): Promise<{ code: string; game: FullGame }> {
  const admin = createAdminClient();
  // Insert-and-retry on the UNIQUE(code) constraint (no TOCTOU window).
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = genRoomCode(6);
    const game = createLobby(code, seed, settings);
    const { data: room, error } = await admin
      .from("rooms")
      .insert({
        code,
        host_id: seed.userId,
        status: game.public.phase,
        version: game.public.version,
        state: game.public,
      })
      .select("id")
      .single();
    if (error) {
      // 23505 = unique_violation → code collision, try a fresh code.
      if ((error as { code?: string }).code === "23505") continue;
      throw error;
    }
    await admin.from("room_secrets").insert({ room_id: room.id, secret: game.secret });
    await admin.from("room_members").upsert({ room_id: room.id, user_id: seed.userId });
    return { code, game };
  }
  throw new Error("部屋コードの生成に失敗しました");
}

export async function joinRoom(code: string, seed: PlayerSeed): Promise<FullGame> {
  const admin = createAdminClient();
  // Retry on version conflict: concurrent joins (or duplicate calls) race on the
  // optimistic version; reloading and re-applying addPlayer is safe & idempotent.
  // Membership is granted only AFTER addPlayer succeeds, so a rejected join
  // (e.g. game already started) never leaves lingering read access.
  let lastConflict: ConflictError | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const loaded = await loadByCode(code);
    if (!loaded) throw new NotFoundError("部屋が見つかりません");
    const expected = loaded.game.public.version;
    // addPlayer adds new lobby players and reconnects existing ones; it rejects
    // brand-new players once the game has started (throws GameError → no retry).
    const next = addPlayer(loaded.game, seed);
    try {
      if (next.public.version !== expected) {
        await persist(loaded.id, expected, next);
      }
      await admin.from("room_members").upsert({ room_id: loaded.id, user_id: seed.userId });
      return next;
    } catch (e) {
      if (e instanceof ConflictError) {
        lastConflict = e;
        continue;
      }
      throw e;
    }
  }
  throw lastConflict ?? new ConflictError("参加処理が競合しました");
}

export async function leaveRoom(code: string, userId: string): Promise<void> {
  const loaded = await loadByCode(code);
  if (!loaded) return;
  const admin = createAdminClient();
  const wasLobby = loaded.game.public.phase === "lobby";
  const next = removePlayer(loaded.game, userId);

  if (wasLobby) {
    await admin.from("room_members").delete().eq("room_id", loaded.id).eq("user_id", userId);
    if (next.public.players.length === 0) {
      // Version-guarded delete so a concurrent join doesn't get its room yanked.
      const { data: del } = await admin
        .from("rooms")
        .delete()
        .eq("id", loaded.id)
        .eq("version", loaded.game.public.version)
        .select("id"); // cascade clears secrets/members/etc.
      if (del && del.length > 0) return;
      // else someone joined concurrently (version bumped) — keep the room.
    }
  }
  if (next.public.version !== loaded.game.public.version) {
    try {
      await persist(loaded.id, loaded.game.public.version, next);
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
    }
  }
}
