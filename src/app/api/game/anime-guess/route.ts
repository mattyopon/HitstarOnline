import { json, withRoomAction } from "@/lib/api";
import { answerAnimeQuiz } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Answer the OPTIONAL "このアニメは？" bonus quiz shown at reveal for songs in
 * a single-franchise pack. 100% side-channel: never gates the "▶ 次の曲へ"
 * advance flow and never affects placement/steal scoring — only awards a
 * small token bonus to the first correct guesser. The server re-derives the
 * correct answer from the deck (never trusts a client "I got it right" claim).
 */
export const POST = withRoomAction(
  {},
  ({ user, body, songs }) => (g) => answerAnimeQuiz(g, user.id, String(body.choice ?? ""), songs),
  (body) =>
    typeof body.choice === "string" && body.choice.length > 0
      ? null
      : json({ error: "選択肢が不正です" }, 400),
);
