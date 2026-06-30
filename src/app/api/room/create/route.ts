import { json, mapError, readBody, requireUser, sanitizeSettings, sanitizeSolo, seedFrom } from "@/lib/api";
import { getDeck, resolveScopeFilter, shuffledDeckOrder } from "@/lib/deck";
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
        listenSeconds: 60, // listen 60s for solo too (matches multiplayer default)
        placementSeconds: 18,
        stealSeconds: 8,
        revealSeconds: 240, // play the song in full at reveal; skip with ▶ 次の曲へ
        categories,
        // Practice never really ends (the deck runs out first); otherwise honor
        // the host's chosen win-card count (defaults to 10).
        targetCards: practice ? 999 : clean.targetCards ?? 10,
      });
      // A selected theme pack ("縛り") constrains the deck exclusively.
      const order = shuffledDeckOrder(resolveScopeFilter(categories));
      const songs = getDeck();
      const now = Date.now();
      await mutateByCode(code, (g) => {
        let ng = g;
        if (solo) for (const b of solo.bots) ng = addBot(ng, b.difficulty);
        return startGame(ng, order, songs, now);
      });
      return json({ code, solo: true, practice });
    }

    // Both casual and ranked are open to everyone, guests included.
    const settings = sanitizeSettings(body.settings);
    const { code } = await createRoom(seed, settings);
    return json({ code });
  } catch (e) {
    return mapError(e);
  }
}
