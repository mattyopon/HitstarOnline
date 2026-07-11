import { extractCode, json, mapError, readBody, requireUser } from "@/lib/api";
import { getDeck, deckKey } from "@/lib/deck";
import { ConflictError, invalidateTrackCache, mutateByCode } from "@/lib/rooms";
import { GameError, currentSongId, systemSkip } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Free "skip this song" — open to ANY room member during placing (no token).
 * Used both by the manual skip button and by the auto-report when a participant
 * can't play the track ("誰か聞けない場合は次の曲"). cardId-guarded so concurrent
 * reports don't over-skip. When skipping because the track is unplayable
 * (reason: "unavailable") the song's cached YouTube id is dropped so it gets
 * re-resolved next time instead of staying broken.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await readBody(req);
  const code = extractCode(body);
  if (!code) return json({ error: "部屋コードがありません" }, 400);

  const songs = getDeck();
  const now = Date.now();
  const unavailable = body.reason === "unavailable";
  let skippedSongId: number | undefined;

  try {
    const result = await mutateByCode(code, (g) => {
      if (!g.public.players.some((p) => p.userId === user.id)) {
        throw new GameError("この部屋のメンバーではありません");
      }
      if (g.public.phase !== "placing") return g;
      // Only skip the card the client is actually looking at (idempotent vs
      // races). cardId is REQUIRED: without it a client could blind-skip a card
      // it never saw, so a missing/mismatched cardId is a silent no-op. Combined
      // with systemSkip's per-turn cap this blocks deck-burn griefing.
      if (typeof body.cardId !== "string" || g.public.current?.cardId !== body.cardId) return g;
      skippedSongId = currentSongId(g);
      return systemSkip(g, songs, now);
    });

    if (unavailable && skippedSongId !== undefined && songs[skippedSongId]) {
      await invalidateTrackCache(deckKey(songs[skippedSongId])).catch(() => {});
    }
    return json({ ok: true, state: result.public });
  } catch (e) {
    if (e instanceof ConflictError) return json({ ok: true });
    return mapError(e);
  }
}
