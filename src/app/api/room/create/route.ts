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
    // Practice = solo with NO NPCs: just keep guessing songs to train. Solo vs
    // NPCs adds bots. Both run entirely server-side with snappy timers.
    const practice = body.practice === true;
    const solo = sanitizeSolo(body.solo);
    if (practice || solo) {
      const clean = sanitizeSettings(body.settings);
      const categories = clean.categories ?? [];
      const { code } = await createRoom(seed, {
        mode: "original",
        listenSeconds: 42,
        placementSeconds: 18,
        stealSeconds: 8,
        revealSeconds: 240, // play the song in full at reveal; skip with ▶ 次の曲へ
        categories,
        // Practice never really ends (the deck runs out first); otherwise honor
        // the host's chosen win-card count (defaults to 10).
        targetCards: practice ? 999 : clean.targetCards ?? 10,
      });
      const order = shuffledDeckOrder(categories);
      const songs = getDeck();
      const now = Date.now();
      await mutateByCode(code, (g) => {
        let ng = g;
        if (solo) for (const b of solo.bots) ng = addBot(ng, b.difficulty);
        return startGame(ng, order, songs, now);
      });
      return json({ code, solo: true, practice });
    }

    // Casual multiplayer is open to guests; only ranked requires a Google account.
    const settings = sanitizeSettings(body.settings);
    if (settings.ranked && user.isAnonymous) {
      return json({ error: "ランクマッチには Google ログインが必要です" }, 403);
    }
    const { code } = await createRoom(seed, settings);
    return json({ code });
  } catch (e) {
    return mapError(e);
  }
}
