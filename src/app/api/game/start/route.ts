import { withRoomAction } from "@/lib/api";
import { shuffledDeckOrder } from "@/lib/deck";
import { GameError, openVoting, startGame } from "@/lib/engine";
import { MIN_DECK_MARGIN } from "@/lib/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// respondState:false — start returns just {ok:true}; clients learn the dealt
// (or voting) state via Realtime (it contains per-player hands, not echoed).
//
// With 2+ connected humans the host OPENS A GENRE VOTE instead of starting the
// game directly; everyone votes and the majority winner builds the deck. Solo /
// mixed-with-bots rooms (humans < 2) keep the direct-start behavior using the
// room's configured categories.
export const POST = withRoomAction({ respondState: false }, ({ user, songs, now }) => (g) => {
  if (g.public.hostId !== user.id) throw new GameError("ホストのみがゲームを開始できます");
  if (g.public.players.length < 2) throw new GameError("2人以上で開始してください");

  const humans = g.public.players.filter((p) => p.connected && !p.isBot).length;
  if (humans >= 2) {
    // Multiplayer → genre majority-vote (openVoting re-checks the precondition).
    return openVoting(g, now);
  }

  // Solo / bots: direct start with the room's configured categories.
  const order = shuffledDeckOrder(g.public.settings.categories);
  if (order.length < g.public.players.length + MIN_DECK_MARGIN) {
    throw new GameError("選んだカテゴリの曲が少なすぎます。カテゴリを追加してください。");
  }
  return startGame(g, order, songs, now);
});
