"use client";

import { useEffect, useMemo, useState } from "react";
import { type PublicState } from "@/lib/protocol";
import { useServerNow } from "@/hooks/useServerNow";
import { ThemeBrowser } from "./scope/ThemeBrowser";
import { useT } from "@/lib/i18n";

/**
 * Genre majority-vote screen (phase "voting"). Every connected human taps the
 * genres they want; the server tallies the majority and starts the game when
 * everyone has voted or the countdown ends. Tallies and the countdown update
 * live from the realtime PublicState (votes + deadline). The timeout itself is
 * driven by the existing auto-advance effect in GameRoom (POST /api/game/advance).
 */
export function VotingPanel({
  state,
  meId,
  busy,
  actionErr,
  onVote,
}: {
  state: PublicState;
  meId: string;
  busy: boolean;
  actionErr: string | null;
  onVote: (categories: string[]) => void;
}) {
  const t = useT();
  const now = useServerNow();
  const votes = state.votes ?? {};
  const myVote = votes[meId];
  const iVoted = myVote !== undefined;

  // Local selection (initialized from any existing vote so re-votes are easy).
  const [picked, setPicked] = useState<string[]>(() => myVote ?? []);
  // Re-sync local picks if the server changes our vote underneath us.
  useEffect(() => {
    if (myVote) setPicked(myVote);
  }, [myVote?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Eligible voters = connected non-bot players (mirrors the server's
  // voteWinner/allVoted base). Stale ballots from departed/disconnected players
  // are ignored so the panel's tally and counts match the server exactly.
  const voters = state.players.filter((p) => p.connected && !p.isBot);
  const eligibleIds = useMemo(
    () => new Set(voters.map((p) => p.userId)),
    [voters.map((p) => p.userId).join(",")], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Per-category vote tallies across eligible ballots only.
  const tally = useMemo(() => {
    const m: Record<string, number> = {};
    for (const [uid, cats] of Object.entries(votes)) {
      if (!eligibleIds.has(uid)) continue;
      for (const c of cats) m[c] = (m[c] ?? 0) + 1;
    }
    return m;
  }, [votes, eligibleIds]);

  const votedCount = voters.filter((p) => p.userId in votes).length;

  const secondsLeft =
    state.deadline != null ? Math.max(0, Math.ceil((state.deadline - now) / 1000)) : null;

  return (
    <div className="card stack">
      <h2 className="section-ttl" style={{ marginTop: 0 }}>🗳️ {t("ジャンル投票")}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {t("みんなで遊ぶジャンルを決めよう。投票してください（複数選択可・未選択＝全ジャンル）")}
      </p>

      <div className="row spread">
        <span className="tiny muted">
          {t("投票済み {voted} / {total} 人", { voted: votedCount, total: voters.length })}
        </span>
        {secondsLeft != null && (
          <span className={"countdown" + (secondsLeft <= 5 ? " urgent" : "")}>
            ⏳ {t("投票終了まで {s}s", { s: secondsLeft })}
          </span>
        )}
      </div>

      {actionErr && <div className="error">{actionErr}</div>}

      <ThemeBrowser selected={picked} onChange={setPicked} tally={tally} variant="vote" />

      <button className="btn block" disabled={busy} onClick={() => onVote(picked)}>
        {iVoted ? t("投票を変更する") : t("この内容で投票する")}
      </button>
      {iVoted && (
        <div className="notice tiny">
          {t("投票を受け付けました。全員の投票が終わると自動で開始します。")}
        </div>
      )}
    </div>
  );
}
