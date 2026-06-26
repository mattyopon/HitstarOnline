import { withRoomAction } from "@/lib/api";
import { shuffledDeckOrder } from "@/lib/deck";
import { GameError, startGame } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// respondState:false — start returns just {ok:true}; clients learn the dealt
// state via Realtime (it contains per-player hands, not echoed to the caller).
export const POST = withRoomAction({ respondState: false }, ({ user, songs, now }) => (g) => {
  if (g.public.hostId !== user.id) throw new GameError("ホストのみがゲームを開始できます");
  if (g.public.players.length < 2) throw new GameError("2人以上で開始してください");
  const order = shuffledDeckOrder(g.public.settings.categories);
  if (order.length < g.public.players.length + 6) {
    throw new GameError("選んだカテゴリの曲が少なすぎます。カテゴリを追加してください。");
  }
  return startGame(g, order, songs, now);
});
