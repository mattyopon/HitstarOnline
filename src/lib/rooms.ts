// Server-side room orchestration: load/save game state with optimistic
// concurrency, manage membership, and resolve YouTube ids for mystery cards.
// Uses the service-role admin client (bypasses RLS). API-route use only.

import { createAdminClient } from "./supabase/admin";
import { getDeck, deckKey, searchQuery } from "./deck";
import { searchYouTubeId } from "./youtube";
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
  const { data, error } = await admin
    .from("rooms")
    .update({
      state: game.public,
      version: game.public.version,
      status: game.public.phase,
      updated_at: new Date().toISOString(),
    })
    .eq("id", roomId)
    .eq("version", expectedVersion)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new ConflictError("バージョン競合が発生しました");
  await admin.from("room_secrets").upsert({ room_id: roomId, secret: game.secret });
}

/**
 * Apply a pure engine transition to a room and persist it with optimistic
 * concurrency. Throws GameError (from the engine) for invalid moves and
 * ConflictError if another writer won the race.
 */
export async function mutateByCode(
  code: string,
  fn: (game: FullGame) => FullGame,
): Promise<FullGame> {
  const loaded = await loadByCode(code);
  if (!loaded) throw new NotFoundError("部屋が見つかりません");
  const expected = loaded.game.public.version;
  const next = fn(loaded.game);
  if (next.public.version === expected) return next; // no-op transition
  await ensureTrackResolved(next);
  await persist(loaded.id, expected, next);
  return next;
}

// ─── Room lifecycle (insert / membership) ──────────────────────────────────--

export async function createRoom(
  seed: PlayerSeed,
  settings: Partial<PublicState["settings"]> = {},
): Promise<{ code: string; game: FullGame }> {
  const admin = createAdminClient();
  // Find a free code.
  let code = "";
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = genRoomCode(attempt < 5 ? 4 : 5);
    const { data: existing } = await admin
      .from("rooms")
      .select("id")
      .eq("code", candidate)
      .maybeSingle();
    if (!existing) {
      code = candidate;
      break;
    }
  }
  if (!code) throw new Error("部屋コードの生成に失敗しました");

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
  if (error) throw error;
  await admin.from("room_secrets").insert({ room_id: room.id, secret: game.secret });
  await admin.from("room_members").upsert({ room_id: room.id, user_id: seed.userId });
  return { code, game };
}

export async function joinRoom(code: string, seed: PlayerSeed): Promise<FullGame> {
  const loaded = await loadByCode(code);
  if (!loaded) throw new NotFoundError("部屋が見つかりません");
  const admin = createAdminClient();
  // Membership first so RLS lets them read/subscribe immediately.
  await admin.from("room_members").upsert({ room_id: loaded.id, user_id: seed.userId });

  const expected = loaded.game.public.version;
  // addPlayer adds new lobby players and reconnects existing ones; it rejects
  // brand-new players once the game has started.
  const next = addPlayer(loaded.game, seed);
  if (next.public.version === expected) return next;
  await ensureTrackResolved(next);
  await persist(loaded.id, expected, next);
  return next;
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
      await admin.from("rooms").delete().eq("id", loaded.id); // cascade clears the rest
      return;
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
