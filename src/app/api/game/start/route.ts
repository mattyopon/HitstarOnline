import { json, mapError, readBody, requireUser } from "@/lib/api";
import { getDeck, shuffledDeckOrder } from "@/lib/deck";
import { GameError, startGame } from "@/lib/engine";
import { mutateByCode } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await readBody(req);
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code) return json({ error: "部屋コードがありません" }, 400);

  const songs = getDeck();
  const now = Date.now();
  try {
    await mutateByCode(code, (g) => {
      if (g.public.hostId !== user.id) throw new GameError("ホストのみがゲームを開始できます");
      if (g.public.players.length < 2) throw new GameError("2人以上で開始してください");
      const order = shuffledDeckOrder(g.public.settings.categories);
      if (order.length < g.public.players.length + 6) {
        throw new GameError("選んだカテゴリの曲が少なすぎます。カテゴリを追加してください。");
      }
      return startGame(g, order, songs, now);
    });
    return json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
