import { withRoomAction } from "@/lib/api";
import { resolveScopeFilter, shuffledDeckOrder } from "@/lib/deck";
import { GameError, openVoting, startGame } from "@/lib/engine";
import { MIN_DECK_MARGIN, isPackId } from "@/lib/protocol";

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

  // A theme-pack ("縛り") scope is a deliberate host choice, so it OVERRIDES the
  // genre vote: resolveScopeFilter yields pack ids only when the host selected a
  // pack. In that case skip voting and start directly even with 2+ humans.
  const scope = resolveScopeFilter(g.public.settings.categories ?? []);
  const packOnly = scope.length > 0 && scope.every(isPackId);

  const humans = g.public.players.filter((p) => p.connected && !p.isBot).length;
  if (humans >= 2 && !packOnly) {
    // Multiplayer + no 縛り → genre majority-vote (openVoting re-checks precond).
    return openVoting(g, now);
  }

  // Solo / bots, OR a pack 縛り: direct start with the resolved scope.
  const order = shuffledDeckOrder(scope);
  if (order.length < g.public.players.length + MIN_DECK_MARGIN) {
    throw new GameError("選んだカテゴリの曲が少なすぎます。カテゴリを追加してください。");
  }
  return startGame(g, order, songs, now);
});
