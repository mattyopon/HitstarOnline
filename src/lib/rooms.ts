// Server-side room orchestration: load/save game state with optimistic
// concurrency, manage membership, and resolve YouTube ids for mystery cards.
// Uses the service-role admin client (bypasses RLS). API-route use only.

import { createAdminClient } from "./supabase/admin";
import { getDeck, deckKey, searchQuery } from "./deck";
import { searchYouTubeId } from "./youtube";
import { recordTransitions } from "./stats";
import { getTierForUser } from "./rank";
import { CHAR_BY_ID } from "./gachaChars";
import { FullGame, PlayerSeed, PublicState, SecretState } from "./protocol";
import {
  addPlayer,
  createLobby,
  resolvedCurrentSongId,
  listenMs,
  needsTrackResolution,
  placeMs,
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

/** Slot-0 party leader for a user, validated against the roster. Cosmetic
 *  only; read via the admin client (player_party RLS is owner-only, and we
 *  deliberately do NOT loosen it — this is the same post-engine injection
 *  pattern as `tier`). Never throws. */
async function getLeaderCharacterId(userId: string): Promise<string | undefined> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("player_party")
      .select("character_id")
      .eq("user_id", userId)
      .eq("slot", 0)
      .maybeSingle();
    const id = data?.character_id as string | undefined;
    return id && CHAR_BY_ID.has(id) ? id : undefined;
  } catch {
    return undefined;
  }
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

/** Fill in current.youtubeId for the mystery card if needed (network + cache).
 *  No system-side auto-skip: if a song can't be resolved the id stays null and
 *  the clients (who actually try to play it) report it unplayable and skip — see
 *  /api/game/skip-song. Failed lookups are NOT cached, so they get another try. */
async function ensureTrackResolved(game: FullGame): Promise<void> {
  if (!needsTrackResolution(game)) return;
  const admin = createAdminClient();
  const songs = getDeck();
  // Redeploy-safe: re-resolve the index from the card's deckKey so a deck.json
  // change mid-game plays the intended song, not whatever now sits at that index.
  const songId = resolvedCurrentSongId(game, songs);
  if (songId === undefined || !game.public.current) return;
  const song = songs[songId];
  if (!song) return;

  // Bilibili cards: the playable id (bvid) is baked into the deck — there is NO
  // network resolution (egress is blocked). Set the public playback hints (still
  // NEVER the answer) and re-anchor the listening clock like the YouTube path.
  if (song.provider === "bilibili") {
    game.public.current.provider = "bilibili";
    game.public.current.bvid = song.bvid;
    // Follow the deck's own flag: bili-hits are the original songs (not covers),
    // so forcing isCover=true here mislabels them ("歌ってみた" banner / wrong
    // "guess the original year" framing). utattemita entries carry isCover:true.
    game.public.current.isCover = song.isCover ?? false;
    reanchorListenClock(game, !!song.bvid);
    return;
  }

  const key = deckKey(song);
  const { data: cached } = await admin
    .from("track_cache")
    .select("youtube_id")
    .eq("key", key)
    .maybeSingle();

  let ytId = cached?.youtube_id ?? null;
  if (!ytId) {
    ytId = await searchYouTubeId(searchQuery(song));
    // Only cache successful resolutions — caching a null would make a transient
    // search failure permanent. (A cached-but-unplayable id is dropped by
    // invalidateTrackCache when a client reports it unavailable.)
    if (ytId) {
      await admin
        .from("track_cache")
        .upsert({ key, youtube_id: ytId, updated_at: new Date().toISOString() });
    }
  }
  game.public.current.youtubeId = ytId;
  reanchorListenClock(game, !!ytId);
}

/** Re-anchor the listening clock to the moment the song actually becomes
 *  playable. beginTurn() starts the clock at turn-begin, but resolving the
 *  playable id (YouTube network lookup, or the bilibili bvid lookup) can add
 *  latency — without this, that latency is silently subtracted from the
 *  listening window AND the 10s early-placement bonus window. Only re-anchors on
 *  a fresh placing turn (not extended / not yet ended) and only when actually
 *  resolved. */
function reanchorListenClock(game: FullGame, resolved: boolean): void {
  if (
    !resolved ||
    !game.public.current ||
    game.public.phase !== "placing" ||
    game.public.listeningEndedAt != null ||
    game.public.listeningExtended
  ) {
    return;
  }
  const s = game.public.settings;
  const now = Date.now();
  const listenDur = game.public.listenDurationMs ?? listenMs(s);
  const placeDur = placeMs(s);
  game.public.current.startedAt = now;
  game.public.listenStartedAt = now;
  game.public.placementDeadline = now + listenDur + placeDur;
  game.public.deadline = game.public.placementDeadline;
}

/** Drop a song's cached YouTube id so it gets re-resolved next time. Called when
 *  a client reports the track as unplayable, so a bad/non-embeddable cached id
 *  doesn't keep the song permanently broken. */
export async function invalidateTrackCache(key: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("track_cache").delete().eq("key", key);
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
  // Ranked rooms snapshot the host's tier (fixed for the room's lifetime).
  const isRanked = !!settings.ranked;
  const roomTier = isRanked ? await getTierForUser(seed.userId) : null;
  // Cosmetic equipped-leader id, published for reaction bubbles / disc art.
  const leaderId = await getLeaderCharacterId(seed.userId);
  // Insert-and-retry on the UNIQUE(code) constraint (no TOCTOU window).
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = genRoomCode(6);
    const game = createLobby(code, seed, settings);
    // Inject tier + leader id into the host's public player (post-engine;
    // engine stays pure and gacha-agnostic).
    const host = game.public.players.find((p) => p.userId === seed.userId);
    if (host && roomTier) host.tier = roomTier;
    if (host && leaderId) host.leaderCharacterId = leaderId;
    const { data: room, error } = await admin
      .from("rooms")
      .insert({
        code,
        host_id: seed.userId,
        status: game.public.phase,
        version: game.public.version,
        state: game.public,
        ranked: isRanked,
        tier: roomTier,
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
  // Both casual and ranked rooms are open to everyone (guests included).
  let lastConflict: ConflictError | null = null;
  // Cosmetic equipped-leader id (resolved once, outside the retry loop).
  const leaderId = await getLeaderCharacterId(seed.userId);
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const loaded = await loadByCode(code);
    if (!loaded) throw new NotFoundError("部屋が見つかりません");
    const expected = loaded.game.public.version;
    // addPlayer adds new lobby players and reconnects existing ones; it rejects
    // brand-new players once the game has started (throws GameError → no retry).
    const next = addPlayer(loaded.game, seed);
    // Ranked rooms: stamp the joiner's tier (post-engine; opaque to the engine).
    if (loaded.game.public.settings.ranked) {
      const joiner = next.public.players.find((p) => p.userId === seed.userId);
      if (joiner) joiner.tier = await getTierForUser(seed.userId);
    }
    // Stamp the joiner's equipped leader (post-engine; opaque to the engine,
    // same pattern as tier). Also refreshes on reconnect, so a party change
    // propagates the next time the player re-joins.
    {
      const joiner = next.public.players.find((p) => p.userId === seed.userId);
      if (joiner && leaderId) joiner.leaderCharacterId = leaderId;
    }
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
  const admin = createAdminClient();
  // Retry under CAS: if a concurrent write bumps the version between our load and
  // persist, reload and re-apply. Without this the leave was silently dropped on
  // ConflictError, leaving the departing player as a permanently-"connected"
  // ghost (mandatory empty turns / undeletable room). removePlayer is idempotent.
  let lastConflict: ConflictError | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const loaded = await loadByCode(code);
    if (!loaded) return;
    // removePlayer fully removes players before dealing (lobby AND voting);
    // afterwards it just marks them disconnected. Clean up the membership row
    // and empty-room deletion in BOTH pre-deal phases.
    const preDeal = loaded.game.public.phase === "lobby" || loaded.game.public.phase === "voting";
    const next = removePlayer(loaded.game, userId);

    if (preDeal) {
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
        // else someone joined concurrently (version bumped) — reload and retry.
        continue;
      }
    }
    if (next.public.version === loaded.game.public.version) return; // nothing to persist
    try {
      await persist(loaded.id, loaded.game.public.version, next);
      return;
    } catch (e) {
      if (e instanceof ConflictError) {
        lastConflict = e;
        continue;
      }
      throw e;
    }
  }
  throw lastConflict ?? new ConflictError("退室処理が競合しました");
}
