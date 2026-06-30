// Shared helpers for API route handlers (server only).
import { getSessionUser, SessionUser } from "./auth";
import { GameError, voteWinner, votesHashSeed } from "./engine";
import { getDeck, shuffledDeckOrder } from "./deck";
import { ConflictError, NotFoundError, mutateByCode } from "./rooms";
import {
  BotDifficulty,
  CATEGORY_IDS,
  FullGame,
  GameMode,
  GameSettings,
  MIN_DECK_MARGIN,
  PlayerSeed,
  Song,
} from "./protocol";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function mapError(e: unknown) {
  if (e instanceof GameError) return json({ error: e.message }, 400);
  if (e instanceof ConflictError) return json({ error: e.message }, 409);
  if (e instanceof NotFoundError) return json({ error: e.message }, 404);
  console.error("[api] unexpected error:", e);
  return json({ error: "サーバーエラーが発生しました" }, 500);
}

/** Returns the user, or a 401 Response to short-circuit the handler. */
export async function requireUser(): Promise<SessionUser | Response> {
  const user = await getSessionUser();
  if (!user) return json({ error: "ログインが必要です" }, 401);
  return user;
}

export function seedFrom(user: SessionUser, name?: unknown): PlayerSeed {
  const provided = typeof name === "string" ? name.trim().slice(0, 24) : "";
  return { userId: user.id, name: provided || user.name, avatarUrl: user.avatarUrl };
}

export function sanitizeSettings(input: unknown): Partial<GameSettings> {
  const s = (input ?? {}) as Record<string, unknown>;
  const out: Partial<GameSettings> = {};
  if (s.mode === "original" || s.mode === "pro" || s.mode === "expert") {
    out.mode = s.mode as GameMode;
  }
  // Ranked matches use Expert rules and count toward the player's record.
  if (s.ranked === true) {
    out.ranked = true;
    out.mode = "expert";
  }
  if (typeof s.targetCards === "number" && s.targetCards >= 1 && s.targetCards <= 50) {
    out.targetCards = Math.floor(s.targetCards);
  }
  if (Array.isArray(s.categories)) {
    out.categories = [...new Set(s.categories)].filter(
      (x): x is string => typeof x === "string" && CATEGORY_IDS.has(x),
    );
  }
  return out;
}

export function sanitizeGuess(
  input: unknown,
): { title?: string; artist?: string } | undefined {
  const g = (input ?? {}) as Record<string, unknown>;
  const title = typeof g.title === "string" ? g.title.trim().slice(0, 80) : "";
  const artist = typeof g.artist === "string" ? g.artist.trim().slice(0, 80) : "";
  if (!title && !artist) return undefined;
  return { title: title || undefined, artist: artist || undefined };
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  return (await req.json().catch(() => ({}))) as Record<string, unknown>;
}

/** Parse the room code from a request body (uppercased); "" if missing/invalid. */
export function extractCode(body: Record<string, unknown>): string {
  return typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
}

/** Validate body.slotIndex as an integer; returns a 400 Response on failure. */
export function parseSlotIndex(body: Record<string, unknown>): number | Response {
  const n = Number(body.slotIndex);
  if (!Number.isInteger(n)) return json({ error: "配置位置が不正です" }, 400);
  return n;
}

interface RoomActionCtx {
  user: SessionUser;
  body: Record<string, unknown>;
  code: string;
  songs: Song[];
  now: number;
}

interface RoomActionOpts {
  /** Load the deck into ctx.songs (default true; false for actions not needing it). */
  deck?: boolean;
  /** Treat ConflictError as success ({ok:true}) — for idempotent advance/next. */
  conflictOk?: boolean;
  /** Include the resulting public state in the response (default true). */
  respondState?: boolean;
}

/**
 * Build a POST handler for a room mutation: auth → parse code → optional
 * validate → mutateByCode(build(ctx)) → { ok, state }. Collapses the identical
 * scaffolding repeated across the game routes; per-route logic lives in `build`.
 * (create/join/leave/matchmake intentionally opt out — their shapes differ.)
 */
export function withRoomAction(
  opts: RoomActionOpts,
  build: (ctx: RoomActionCtx) => (game: FullGame) => FullGame,
  validate?: (body: Record<string, unknown>, code: string) => Response | null,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const user = await requireUser();
    if (user instanceof Response) return user;
    const body = await readBody(req);
    const code = extractCode(body);
    if (!code) return json({ error: "部屋コードがありません" }, 400);
    if (validate) {
      const bad = validate(body, code);
      if (bad) return bad;
    }
    const songs = opts.deck === false ? [] : getDeck();
    const now = Date.now();
    try {
      const result = await mutateByCode(code, build({ user, body, code, songs, now }));
      return opts.respondState === false
        ? json({ ok: true })
        : json({ ok: true, state: result.public });
    } catch (e) {
      if (opts.conflictOk && e instanceof ConflictError) return json({ ok: true });
      return mapError(e);
    }
  };
}

/**
 * Build the seeded deck draw order for the vote-start path. Computes the genre
 * majority winner, derives a deterministic seed from room state, and shuffles
 * the matching deck. Falls back to ALL categories (the all-abstain default and
 * the too-small-deck recovery) so a winning genre can't leave the deck short.
 * DETERMINISTIC for a given game state → safe to recompute on each CAS retry.
 */
export function buildVoteStartOrder(g: FullGame): number[] {
  const seed = votesHashSeed(g);
  const winner = voteWinner(g); // [] = all categories
  const n = g.public.players.length;
  const order = shuffledDeckOrder(winner, seed);
  if (winner.length > 0 && order.length < n + MIN_DECK_MARGIN) {
    // The democratic winner is too small → fall back to all categories so the
    // game still starts. (startFromVote returns to lobby if even this is short.)
    return shuffledDeckOrder([], seed);
  }
  return order;
}

/** Validate a solo request body: { bots: [{difficulty}], ... }. */
export function sanitizeSolo(input: unknown): { bots: { difficulty: BotDifficulty }[] } | null {
  const s = (input ?? {}) as Record<string, unknown>;
  if (!Array.isArray(s.bots)) return null;
  const diffs: BotDifficulty[] = ["easy", "normal", "hard"];
  const bots = s.bots.slice(0, 3).map((b) => {
    const d = (b as { difficulty?: unknown })?.difficulty;
    return { difficulty: (diffs as string[]).includes(d as string) ? (d as BotDifficulty) : "normal" };
  });
  if (bots.length < 1) return null;
  return { bots };
}
