import { json, mapError, readBody, requireUser, sanitizeSettings, sanitizeSolo, seedFrom } from "@/lib/api";
import { getDeck, shuffledDeckOrder } from "@/lib/deck";
import { addBot, startGame } from "@/lib/engine";
import { createRoom, mutateByCode } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await readBody(req);
  const seed = seedFrom(user, body.name);

  try {
    const solo = sanitizeSolo(body.solo);
    if (solo) {
      // Solo vs NPCs: create the room, add bots, and start — all server-side.
      // Snappier timers since there's no waiting on other humans.
      const categories = sanitizeSettings(body.settings).categories ?? [];
      const { code } = await createRoom(seed, {
        mode: "original",
        listenSeconds: 12,
        placementSeconds: 18,
        stealSeconds: 8,
        revealSeconds: 7,
        categories,
      });
      const order = shuffledDeckOrder(categories);
      const songs = getDeck();
      const now = Date.now();
      await mutateByCode(code, (g) => {
        let ng = g;
        for (const b of solo.bots) ng = addBot(ng, b.difficulty);
        return startGame(ng, order, songs, now);
      });
      return json({ code, solo: true });
    }

    // Multiplayer requires a Google account (guests can only play solo).
    if (user.isAnonymous) {
      return json({ error: "みんなで遊ぶには Google ログインが必要です" }, 403);
    }
    const { code } = await createRoom(seed, sanitizeSettings(body.settings));
    return json({ code });
  } catch (e) {
    return mapError(e);
  }
}
