// Shared helpers for API route handlers (server only).
import { getSessionUser, SessionUser } from "./auth";
import { GameError } from "./engine";
import { ConflictError, NotFoundError } from "./rooms";
import { GameMode, GameSettings, PlayerSeed } from "./protocol";

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
  if (typeof s.targetCards === "number" && s.targetCards >= 3 && s.targetCards <= 20) {
    out.targetCards = Math.floor(s.targetCards);
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
