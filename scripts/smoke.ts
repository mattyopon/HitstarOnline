/**
 * Engine smoke test — exercises the full-rules game engine deterministically.
 * Run with: npm run test:engine   (uses tsx)
 *
 * No network or Supabase needed; this validates pure game logic.
 */
import assert from "node:assert";
import {
  createLobby,
  createGame,
  addPlayer,
  addBot,
  startGame,
  placeCard,
  stealCard,
  skipSong,
  buyCard,
  extendListening,
  passSteal,
  advance,
  isPlacementCorrect,
  openVoting,
  castVote,
  allVoted,
  voteWinner,
  votesHashSeed,
  startFromVote,
  removePlayer,
  setConnected,
  mulberry32,
  needsTrackResolution,
  answerAnimeQuiz,
  advanceReveal,
  systemSkip,
  MAX_FREE_SKIPS_PER_TURN,
} from "../src/lib/engine";
import {
  Song,
  CATEGORIES,
  CATEGORY_IDS,
  PACKS,
  PACK_IDS,
  PACK_PREFIX,
  isPackId,
} from "../src/lib/protocol";
import { resolveScopeFilter, sanitizeScope, deckSizeForCategories } from "../src/lib/deck";
import { applyResult, defaultRank } from "../src/lib/rank";

// 12 songs, years 1960,1965,...,2015 — distinct so placement is determinable.
const songs: Song[] = Array.from({ length: 12 }, (_, i) => ({
  title: `Song${i}`,
  artist: `Artist${i}`,
  year: 1960 + i * 5,
}));

let passed = 0;
function ok(label: string, cond: boolean) {
  assert.ok(cond, label);
  passed++;
  console.log(`  ✓ ${label}`);
}

// ── Unit: placement correctness ────────────────────────────────────────────
console.log("isPlacementCorrect:");
{
  const t = [
    { id: "a", songId: 0, title: "", artist: "", year: 1970 },
    { id: "b", songId: 1, title: "", artist: "", year: 1990 },
  ];
  ok("before-first correct", isPlacementCorrect(t, 0, 1960));
  ok("before-first wrong", !isPlacementCorrect(t, 0, 1980));
  ok("middle correct", isPlacementCorrect(t, 1, 1980));
  ok("middle wrong (too early)", !isPlacementCorrect(t, 1, 1965));
  ok("after-last correct", isPlacementCorrect(t, 2, 2000));
  ok("equal year boundary ok", isPlacementCorrect(t, 1, 1990));
}

// ── Scenario A: no tokens → placement resolves immediately ─────────────────
console.log("Scenario A (no tokens):");
{
  let g = createLobby("ROOMAA", { userId: "alice", name: "Alice" }, {
    startingTokens: 0,
    allowSkip: false,
    revealSeconds: 10,
    placeSeconds: 60,
    earlyBonusMs: 0, // disable the early bonus so the "no tokens ever" invariant holds
    placementTokens: 0, // ditto: no per-placement token in this scenario
  });
  g = addPlayer(g, { userId: "bob", name: "Bob" });
  g = addPlayer(g, { userId: "carol", name: "Carol" });
  // deck: starting cards 0(1960),1(1965),2(1970); mystery 5(1985), then 8(2000)
  g = startGame(g, [0, 1, 2, 5, 8], songs, 1000);

  ok("3 players seeded", g.public.players.length === 3);
  ok("each has 1 starting card", g.public.players.every((p) => p.timeline.length === 1));
  ok("phase placing", g.public.phase === "placing");
  ok("alice active", g.public.order[g.public.activeIndex] === "alice");
  ok("mystery present", !!g.public.current);
  ok("no token holders → no steal possible later", g.public.players.every((p) => p.tokens === 0));

  // Alice (timeline [1960]) places 1985 after → correct. No stealers (0 tokens).
  g = placeCard(g, "alice", 1, undefined, songs, 2000);
  ok("resolved straight to reveal", g.public.phase === "reveal");
  ok("active correct", g.public.reveal!.activeCorrect === true);
  ok("card awarded to alice", g.public.reveal!.awardedTo === "alice");
  ok("alice timeline grew to 2", g.public.players.find((p) => p.userId === "alice")!.timeline.length === 2);

  // Advance past reveal → next turn (bob).
  g = advance(g, songs, 999999);
  ok("next turn → bob active", g.public.order[g.public.activeIndex] === "bob");
  ok("phase placing again", g.public.phase === "placing");

  // Bob (timeline [1965]) places 2000 BEFORE 1965 → wrong → discarded.
  g = placeCard(g, "bob", 0, undefined, songs, 1000000);
  ok("bob wrong", g.public.reveal!.activeCorrect === false);
  ok("no award on wrong", g.public.reveal!.awardedTo === null);
  ok("bob timeline unchanged", g.public.players.find((p) => p.userId === "bob")!.timeline.length === 1);
}

// ── Scenario B: tokens, skip, guess bonus, steal-wins ──────────────────────
console.log("Scenario B (tokens / skip / steal / guess):");
{
  let g = createLobby("ROOMBB", { userId: "alice", name: "Alice" }, {
    startingTokens: 2,
    allowSkip: true,
    stealSeconds: 20,
    revealSeconds: 10,
  });
  g = addPlayer(g, { userId: "bob", name: "Bob" });
  g = addPlayer(g, { userId: "carol", name: "Carol" });
  // starting: 0(1960),1(1965),2(1970); mystery 11(2015); after skip 3(1975)
  g = startGame(g, [0, 1, 2, 11, 3], songs, 1000);
  ok("alice has 2 tokens", g.public.players.find((p) => p.userId === "alice")!.tokens === 2);

  // Alice skips the 2015 track (spend a token), draws 1975.
  g = skipSong(g, "alice", songs, 1100);
  ok("alice token spent on skip", g.public.players.find((p) => p.userId === "alice")!.tokens === 1);

  // Alice places 1975 BEFORE 1960 → wrong. Names BOTH title+artist → +1 token.
  g = placeCard(g, "alice", 0, { title: "Song3", artist: "Artist3" }, songs, 1200);
  ok("stealing opens (others have tokens)", g.public.phase === "stealing");

  // Carol (timeline [1970]) steals at slot 1 → 1975 after 1970 → correct.
  g = stealCard(g, "carol", 1, songs, 1300);
  ok("carol token spent", g.public.players.find((p) => p.userId === "carol")!.tokens === 1);
  ok("still stealing (bob can still act)", g.public.phase === "stealing");

  // Bob (timeline [1965]) steals at slot 0 → 1975 before 1965 → wrong.
  // After bob, no eligible stealers remain → auto-resolve.
  g = stealCard(g, "bob", 0, songs, 1400);
  ok("auto-resolved after last stealer", g.public.phase === "reveal");
  ok("active was wrong", g.public.reveal!.activeCorrect === false);
  ok("card stolen by carol (first correct)", g.public.reveal!.awardedTo === "carol");
  ok("carol timeline grew", g.public.players.find((p) => p.userId === "carol")!.timeline.length === 2);
  ok("bob got nothing", g.public.players.find((p) => p.userId === "bob")!.timeline.length === 1);

  // Token bonus: alice gained +1 from naming both title+artist (1 → 2).
  ok("alice earned a token (both names)", g.public.players.find((p) => p.userId === "alice")!.tokens === 2);
  ok(
    "token award recorded",
    g.public.reveal!.tokenAwards.some(
      (a) => a.userId === "alice" && a.namedTitle && a.namedArtist && a.tokensGained === 1,
    ),
  );
}

// ── Scenario C: timeout via advance ────────────────────────────────────────
console.log("Scenario C (timeout):");
{
  let g = createLobby("ROOMCC", { userId: "alice", name: "Alice" }, { startingTokens: 0, allowSkip: false });
  g = addPlayer(g, { userId: "bob", name: "Bob" });
  g = startGame(g, [0, 1, 5], songs, 1000);
  const dl = g.public.deadline!;
  // During the listening window: advance is a no-op.
  const before = advance(g, songs, 2000);
  ok("advance during listening is no-op", before.public.version === g.public.version);
  // After the placement deadline: placing times out → reveal with no award.
  g = advance(g, songs, dl + 1);
  ok("placing timed out → reveal", g.public.phase === "reveal");
  ok("timeout reason set", g.public.reveal!.reason === "時間切れ");
  ok("no award on timeout", g.public.reveal!.awardedTo === null);
}

// ── Scenario D: buy a card ─────────────────────────────────────────────────
console.log("Scenario D (buy a card):");
{
  let g = createLobby("ROOMDD", { userId: "alice", name: "Alice" }, {
    startingTokens: 3,
    buyCost: 3,
  });
  g = addPlayer(g, { userId: "bob", name: "Bob" });
  // starting 0(1960),4(1980); mystery 8(2000)
  g = startGame(g, [0, 4, 8], songs, 1000);
  const before = g.public.players.find((p) => p.userId === "alice")!.timeline.length;
  g = buyCard(g, "alice", songs, 1100);
  ok("buy → reveal", g.public.phase === "reveal");
  ok("bought flag set", g.public.reveal!.bought === true);
  ok("auto-placed correctly", g.public.reveal!.activeCorrect === true);
  ok("alice timeline grew", g.public.players.find((p) => p.userId === "alice")!.timeline.length === before + 1);
  ok("alice spent 3 tokens", g.public.players.find((p) => p.userId === "alice")!.tokens === 0);
}

// ── Scenario E: solo with an NPC (bot) ─────────────────────────────────────
console.log("Scenario E (solo NPC):");
{
  let g = createLobby("ROOMEE", { userId: "alice", name: "Alice" }, {
    startingTokens: 2,
    placeSeconds: 60,
    stealSeconds: 20,
    revealSeconds: 10,
  });
  g = addBot(g, "hard");
  // starting: 0(1960)→alice, 4(1980)→bot; mystery 8(2000), then 2,10,6...
  g = startGame(g, [0, 4, 8, 2, 10, 6, 11, 9], songs, 1000);
  ok("bot is a player", g.public.players.some((p) => p.isBot));
  ok("bot connected", g.public.players.find((p) => p.isBot)!.connected === true);
  ok("difficulty stored secret-side", !!g.secret.bots && Object.keys(g.secret.bots).length === 1);
  ok("difficulty NOT in public state", !JSON.stringify(g.public).includes("difficulty"));

  // Alice (human, seat0) is active; before her deadline nothing should happen.
  const v0 = g.public.version;
  g = advance(g, songs, 1100);
  ok("human turn: advance no-op before deadline", g.public.version === v0);

  // Alice places 2000 after 1960 → correct; bot has tokens → stealing opens.
  g = placeCard(g, "alice", 1, undefined, songs, 1200);
  ok("stealing opens (bot can steal)", g.public.phase === "stealing");

  // Run the clock forward; bot either steals or the window times out → reveal.
  let guard = 0;
  let t = 1200;
  while (g.public.phase !== "reveal" && guard++ < 6) {
    t += 30000;
    g = advance(g, songs, t);
  }
  ok("reached reveal after steal window", g.public.phase === "reveal");

  // Next turn becomes the bot's; bot takes it via stepBots (no human client).
  t += 30000;
  g = advance(g, songs, t); // reveal timeout → nextTurn (bot active)
  ok("bot's turn begins (placing)", g.public.phase === "placing");
  ok("active is the bot", g.public.order[g.public.activeIndex].startsWith("bot:"));

  const vb = g.public.version;
  const tBot = (g.public.deadline ?? t) - 100; // just before deadline, past botActAt
  // determinism: same inputs → identical result
  const a1 = advance(g, songs, tBot);
  const a2 = advance(g, songs, tBot);
  ok("bot acted (version bumped)", a1.public.version > vb);
  ok("bot decision deterministic on retry", JSON.stringify(a1.public) === JSON.stringify(a2.public));
}

// ── Scenario F: no connected human → game ends (abandoned room) ─────────────
console.log("Scenario F (abandoned room ends):");
{
  let g = createLobby("ROOMFF", { userId: "alice", name: "Alice" }, { startingTokens: 0 });
  g = addBot(g, "easy");
  g = startGame(g, [0, 4, 8, 2], songs, 1000);
  // Simulate the only human disconnecting.
  g.public.players.find((p) => p.userId === "alice")!.connected = false;
  g = advance(g, songs, 2000);
  ok("no-human guard ends the game", g.public.phase === "gameover");
  ok("a winner is still declared", g.public.winnerId !== undefined);
}

// ── Scenario G: listening extension + early-placement bonus ────────────────
console.log("Scenario G (extend + early bonus):");
{
  // alice [1960], bob [1965]; mystery 5(1985) for alice.
  let g = createGame(
    "ROOMGG",
    [{ userId: "alice", name: "Alice" }, { userId: "bob", name: "Bob" }],
    [0, 1, 5],
    songs,
    1000,
    { startingTokens: 2, listenSeconds: 30, placementSeconds: 30, extendSeconds: 60, earlyBonusMs: 10000, earlyBonusTokens: 2 },
  );
  ok("listen 30s", g.public.listenDurationMs === 30000);
  ok("not extended", g.public.listeningExtended === false);
  ok("placementDeadline = start+60s", g.public.placementDeadline === 1000 + 60000);

  g = extendListening(g, "alice", 5000);
  ok("extended flag", g.public.listeningExtended === true);
  ok("listen now 90s", g.public.listenDurationMs === 90000);
  ok("alice spent extend token (2→1)", g.public.players[0].tokens === 1);
  ok("placementDeadline = start+120s", g.public.placementDeadline === 1000 + 120000);

  let threw = false;
  try {
    extendListening(g, "alice", 6000);
  } catch {
    threw = true;
  }
  ok("second extend rejected", threw);

  // Submit a CORRECT placement within 10s of song start → +2 bonus.
  g = placeCard(g, "alice", 1, undefined, songs, 8000);
  ok("listeningEndedAt set on submit", g.public.listeningEndedAt === 8000);
  ok("early bonus flagged", g.public.earlyBonusAwarded === true);
  ok("alice +2 early bonus (1→3)", g.public.players[0].tokens === 3);
}

// ── Scenario G2: non-active listener extends for FREE (shared once-per-turn) ─
console.log("Scenario G2 (free extension by a non-active listener):");
{
  // alice active [1960], bob non-active [1965]; mystery 5(1985) for alice.
  let g = createGame(
    "ROOMG2",
    [{ userId: "alice", name: "Alice" }, { userId: "bob", name: "Bob" }],
    [0, 1, 5],
    songs,
    1000,
    { startingTokens: 2, listenSeconds: 30, placementSeconds: 30, extendSeconds: 60 },
  );

  // A non-member can't extend.
  let threw = false;
  try {
    extendListening(g, "mallory", 5000);
  } catch {
    threw = true;
  }
  ok("non-member extend rejected", threw);

  // A disconnected non-active player can't extend (only live listeners can).
  const gDisc = setConnected(g, "bob", false);
  threw = false;
  try {
    extendListening(gDisc, "bob", 5000);
  } catch {
    threw = true;
  }
  ok("disconnected non-active extend rejected", threw);

  // Connected non-active bob extends: FREE, same flag/duration/deadline shift.
  g = extendListening(g, "bob", 5000);
  ok("free-extended flag set", g.public.listeningExtended === true);
  ok("listen now 90s", g.public.listenDurationMs === 90000);
  ok("bob paid nothing (2→2)", g.public.players[1].tokens === 2);
  ok("placementDeadline = start+120s", g.public.placementDeadline === 1000 + 120000);

  // The shared once-per-turn flag is consumed — even the active player can't stack.
  threw = false;
  try {
    extendListening(g, "alice", 6000);
  } catch {
    threw = true;
  }
  ok("active extend after free extend rejected", threw);
}

// ── Scenario H: no early bonus after the 10s window ────────────────────────
console.log("Scenario H (no early bonus when late):");
{
  let g = createGame(
    "ROOMHH",
    [{ userId: "alice", name: "Alice" }, { userId: "bob", name: "Bob" }],
    [0, 1, 5],
    songs,
    1000,
    { startingTokens: 0, earlyBonusMs: 10000, placementTokens: 0 },
  );
  g = placeCard(g, "alice", 1, undefined, songs, 1000 + 12000); // correct, but late
  ok("no early bonus (late)", g.public.earlyBonusAwarded === false);
  ok("alice tokens unchanged", g.public.players[0].tokens === 0);
}

// ── Scenario H2: per-placement token (correct → +N, wrong → +0) ────────────
console.log("Scenario H2 (placement token):");
{
  // CORRECT: alice [1960], bob [1965]; mystery 5(1985). bob has 0 tokens → no
  // stealers → placeCard resolves immediately. Late submit → no early bonus.
  let g = createGame(
    "ROOMH2",
    [{ userId: "alice", name: "Alice" }, { userId: "bob", name: "Bob" }],
    [0, 1, 5],
    songs,
    1000,
    { startingTokens: 0, earlyBonusMs: 0, placementTokens: 1 },
  );
  g = placeCard(g, "alice", 1, undefined, songs, 1000 + 20000); // 1985 after 1960 → correct
  ok("resolved to reveal", g.public.phase === "reveal");
  ok("alice +1 for correct placement", g.public.players[0].tokens === 1);
  ok(
    "placement token award recorded",
    g.public.reveal!.tokenAwards.some((a) => a.userId === "alice" && a.reason === "正解配置" && a.tokensGained === 1),
  );

  // WRONG: fresh game, alice places 1985 BEFORE 1960 (slot 0) → wrong → no token.
  let g2 = createGame(
    "ROOMH3",
    [{ userId: "alice", name: "Alice" }, { userId: "bob", name: "Bob" }],
    [0, 1, 5],
    songs,
    1000,
    { startingTokens: 0, earlyBonusMs: 0, placementTokens: 1 },
  );
  g2 = placeCard(g2, "alice", 0, undefined, songs, 1000 + 20000);
  ok("wrong placement → reveal", g2.public.phase === "reveal" && g2.public.reveal!.activeCorrect === false);
  ok("wrong placement → no placement token", g2.public.players[0].tokens === 0);

  // CAP: a player at maxTokens gets no placement token (recorded as +0/filtered).
  let g3 = createGame(
    "ROOMH4",
    [{ userId: "alice", name: "Alice" }, { userId: "bob", name: "Bob" }],
    [0, 1, 5],
    songs,
    1000,
    { startingTokens: 5, maxTokens: 5, earlyBonusMs: 0, placementTokens: 1, stealSeconds: 10 },
  );
  // bob has 5 tokens → eligible stealer → stealing opens; pass to resolve.
  g3 = placeCard(g3, "alice", 1, undefined, songs, 1000 + 20000); // correct
  if (g3.public.phase === "stealing") g3 = passSteal(g3, "bob", songs, 1000 + 20100);
  ok("alice stays capped at 5", g3.public.players[0].tokens === 5);
}

// ── Scenario I: steal pass → early end of the steal phase ──────────────────
console.log("Scenario I (steal pass early-end):");
{
  let g = createGame(
    "ROOMII",
    [
      { userId: "alice", name: "Alice" },
      { userId: "bob", name: "Bob" },
      { userId: "carol", name: "Carol" },
    ],
    [0, 1, 2, 5],
    songs,
    1000,
    { startingTokens: 2, stealSeconds: 10 },
  );
  g = placeCard(g, "alice", 1, undefined, songs, 2000);
  ok("stealing opens", g.public.phase === "stealing");
  ok("steal deadline = +10s", g.public.deadline === 2000 + 10000);
  g = passSteal(g, "bob", songs, 2100);
  ok("bob passed", g.public.stealerDecisions?.bob === "pass");
  ok("still stealing (carol undecided)", g.public.phase === "stealing");
  g = passSteal(g, "carol", songs, 2200);
  ok("all decided → reveal early", g.public.phase === "reveal");
  ok("no steals occurred", g.public.reveal!.steals.length === 0);
}

// ── Scenario J: placement timeout (listen-end mark then deadline) ──────────
console.log("Scenario J (placement timeout):");
{
  let g = createGame(
    "ROOMJJ",
    [{ userId: "alice", name: "Alice" }, { userId: "bob", name: "Bob" }],
    [0, 1, 5],
    songs,
    1000,
    { startingTokens: 0, listenSeconds: 30, placementSeconds: 30 },
  );
  const pd = g.public.placementDeadline!;
  ok("placementDeadline = listenEnd+30s", pd === 1000 + 60000);
  g = advance(g, songs, 1000 + 30000 + 1); // mid-window → marks listen end
  ok("listeningEndedAt marked", g.public.listeningEndedAt != null);
  ok("still placing", g.public.phase === "placing");
  g = advance(g, songs, pd + 1); // deadline → resolve
  ok("timed out → reveal", g.public.phase === "reveal");
  ok("reason 時間切れ", g.public.reveal!.reason === "時間切れ");
  ok("no award on timeout", g.public.reveal!.awardedTo === null);
}

// ── Scenario K: rank LP / tier transitions (pure applyResult) ──────────────
console.log("Scenario K (rank LP):");
{
  const win = (r: ReturnType<typeof defaultRank>) => applyResult(r, true);
  const loss = (r: ReturnType<typeof defaultRank>) => applyResult(r, false);

  ok("starts bronze 0", defaultRank().tier === "bronze" && defaultRank().lp === 0);

  let r = win(defaultRank());
  ok("bronze 0 +win → bronze 25", r.tier === "bronze" && r.lp === 25 && r.wins === 1 && r.games === 1);

  r = win({ tier: "bronze", lp: 80, games: 0, wins: 0 });
  ok("bronze 80 +win → silver 0 (promo, reset)", r.tier === "silver" && r.lp === 0);

  r = loss({ tier: "bronze", lp: 0, games: 0, wins: 0 });
  ok("bronze 0 −loss → wood 75 (demote)", r.tier === "wood" && r.lp === 75);

  r = loss({ tier: "wood", lp: 0, games: 0, wins: 0 });
  ok("wood 0 −loss → wood 0 (floor)", r.tier === "wood" && r.lp === 0);

  r = loss({ tier: "wood", lp: 10, games: 0, wins: 0 });
  ok("wood 10 −loss → wood 0 (clamp, no demote)", r.tier === "wood" && r.lp === 0);

  r = win({ tier: "challenger", lp: 90, games: 0, wins: 0 });
  ok("challenger 90 +win → challenger 100 (apex cap)", r.tier === "challenger" && r.lp === 100);

  r = win({ tier: "challenger", lp: 100, games: 0, wins: 0 });
  ok("challenger 100 +win → stays 100", r.tier === "challenger" && r.lp === 100);

  r = loss({ tier: "challenger", lp: 100, games: 0, wins: 0 });
  ok("challenger 100 −loss → challenger 80", r.tier === "challenger" && r.lp === 80);

  r = win({ tier: "diamond", lp: 40, games: 0, wins: 0 });
  ok("diamond 40 +win → diamond 65 (no promo)", r.tier === "diamond" && r.lp === 65);

  r = loss({ tier: "diamond", lp: 40, games: 0, wins: 0 });
  ok("diamond 40 −loss → diamond 20 (no demote)", r.tier === "diamond" && r.lp === 20);
}

// ── Scenario L: genre majority-vote (voting phase) ─────────────────────────
console.log("Scenario L (genre vote):");
{
  // openVoting precondition: needs >= 2 connected non-bot humans.
  let solo = createLobby("ROOMLA", { userId: "alice", name: "Alice" }, {});
  solo = addBot(solo, "normal"); // 1 human + 1 bot → still < 2 humans
  let threw = false;
  try {
    openVoting(solo, 1000);
  } catch {
    threw = true;
  }
  ok("openVoting rejects < 2 humans (1 human + bot)", threw);

  let g = createLobby("ROOMLB", { userId: "alice", name: "Alice" }, {});
  g = addPlayer(g, { userId: "bob", name: "Bob" });
  g = addPlayer(g, { userId: "carol", name: "Carol" });
  const vBefore = g.public.version;
  g = openVoting(g, 1000);
  ok("openVoting → voting phase", g.public.phase === "voting");
  ok("voting bumps version", g.public.version > vBefore);
  ok("votes initialized empty", !!g.public.votes && Object.keys(g.public.votes).length === 0);
  ok("voting deadline set", typeof g.public.deadline === "number" && g.public.deadline! > 1000);

  // castVote tallies; not everyone voted yet.
  g = castVote(g, "alice", ["rock", "jazz"], 1100);
  ok("alice vote recorded", JSON.stringify(g.public.votes!.alice) === JSON.stringify(["rock", "jazz"]));
  ok("not all voted yet", allVoted(g.public) === false);

  // Idempotent re-vote: identical → no version bump (S2).
  const vSame = g.public.version;
  g = castVote(g, "alice", ["rock", "jazz"], 1150);
  ok("identical re-vote is a no-op", g.public.version === vSame);

  // Changed vote bumps version.
  g = castVote(g, "alice", ["rock"], 1160);
  ok("changed vote bumps version", g.public.version > vSame);

  g = castVote(g, "bob", ["rock"], 1200);
  g = castVote(g, "carol", ["jazz"], 1300);
  ok("all eligible voted → allVoted true", allVoted(g.public) === true);

  // voteWinner: rock has 2, jazz has 1 → rock wins.
  ok("voteWinner = [rock]", JSON.stringify(voteWinner(g)) === JSON.stringify(["rock"]));

  // Atomic all-voted start (engine-level): supply a sufficient deck order.
  const order = [0, 1, 2, 5, 8, 9, 10, 11];
  const started = startFromVote(g, order, songs, 1400);
  ok("startFromVote → placing", started.public.phase === "placing");
  ok("votes cleared on start", started.public.votes === undefined);
  ok("each player seeded one card", started.public.players.every((p) => p.timeline.length === 1));

  // Idempotency / phase guard (M1): calling again on the started game is a no-op.
  const again = startFromVote(started, order, songs, 1500);
  ok("startFromVote idempotent (already placing → no-op)", again.public.version === started.public.version);
}

// ── Scenario M: vote deadline timeout via advance-style start + tie-break ───
console.log("Scenario M (vote tie / abstain / seed):");
{
  let g = createLobby("ROOMMA", { userId: "alice", name: "Alice" }, {});
  g = addPlayer(g, { userId: "bob", name: "Bob" });
  g = openVoting(g, 1000);

  // Tie: alice→rock, bob→jazz; voteWinner returns BOTH (max-count), in canonical
  // CATEGORIES order, deterministically. The expected relative order is derived
  // from CATEGORIES so this stays correct if the menu order changes.
  g = castVote(g, "alice", ["rock"], 1100);
  g = castVote(g, "bob", ["jazz"], 1200);
  const tie = voteWinner(g);
  ok("tie returns both max-count cats", tie.length === 2 && tie.includes("rock") && tie.includes("jazz"));
  const catOrder = CATEGORIES.map((c) => c.id);
  const expectFirst = catOrder.indexOf("rock") < catOrder.indexOf("jazz") ? "rock" : "jazz";
  const expectSecond = expectFirst === "rock" ? "jazz" : "rock";
  ok("tie order is canonical (matches CATEGORIES order)", tie.indexOf(expectFirst) < tie.indexOf(expectSecond));

  // votesHashSeed deterministic for the same state, differs after a vote change.
  const seed1 = votesHashSeed(g);
  const seed1b = votesHashSeed(g);
  ok("votesHashSeed deterministic", seed1 === seed1b);
  const g2 = castVote(g, "bob", ["rock"], 1300); // changes version
  ok("votesHashSeed changes when state changes", votesHashSeed(g2) !== seed1);

  // All-abstain → voteWinner is [] (all categories), NOT settings.categories (M8).
  let h = createLobby("ROOMMB", { userId: "alice", name: "Alice" }, { categories: ["rock"] });
  h = addPlayer(h, { userId: "bob", name: "Bob" });
  h = openVoting(h, 1000);
  ok("all-abstain winner is [] (all)", JSON.stringify(voteWinner(h)) === JSON.stringify([]));
}

// ── Scenario N: too-small deck → return to lobby (no throw) ─────────────────
console.log("Scenario N (vote recovery to lobby):");
{
  let g = createLobby("ROOMNN", { userId: "alice", name: "Alice" }, {});
  g = addPlayer(g, { userId: "bob", name: "Bob" });
  g = addPlayer(g, { userId: "carol", name: "Carol" });
  g = openVoting(g, 1000);
  g = castVote(g, "alice", ["rock"], 1100);
  // Deck of only 2 songs < players(3) + 1 → cannot seat everyone.
  const recovered = startFromVote(g, [0, 1], songs, 1200);
  ok("too-small deck → back to lobby", recovered.public.phase === "lobby");
  ok("votes cleared on recovery", recovered.public.votes === undefined);
  ok("recovery clears deadline", recovered.public.deadline === undefined);
}

// ── Scenario O: vote cleanup on leave + disconnect completion ───────────────
console.log("Scenario O (vote cleanup on leave):");
{
  let g = createLobby("ROOMOO", { userId: "alice", name: "Alice" }, {});
  g = addPlayer(g, { userId: "bob", name: "Bob" });
  g = addPlayer(g, { userId: "carol", name: "Carol" });
  g = openVoting(g, 1000);
  g = castVote(g, "alice", ["rock"], 1100);
  g = castVote(g, "carol", ["rock"], 1150);
  ok("carol vote present before leave", "carol" in (g.public.votes ?? {}));
  // Carol leaves mid-vote → voting is pre-game, so she is SPLICED OUT entirely
  // (not merely marked disconnected) and her vote is removed.
  g = removePlayer(g, "carol");
  ok("carol vote deleted on removePlayer", !("carol" in (g.public.votes ?? {})));
  ok("carol removed from players (voting splices like lobby)", !g.public.players.some((p) => p.userId === "carol"));
  ok("carol removed from order", !g.public.order.includes("carol"));
  ok("remaining players re-seated 0..n", g.public.players.every((p, i) => p.seat === i));

  // Now eligible voters = alice + bob (carol gone). Alice voted; bob has not →
  // not complete. After bob votes, complete (tally ignores departed carol).
  ok("not all voted (bob pending)", allVoted(g.public) === false);
  g = castVote(g, "bob", ["rock"], 1200);
  ok("complete once present voters voted", allVoted(g.public) === true);
  ok("voteWinner ignores departed carol", JSON.stringify(voteWinner(g)) === JSON.stringify(["rock"]));

  // A disconnected non-bot is excluded from the eligible set too.
  let h = createLobby("ROOMOP", { userId: "alice", name: "Alice" }, {});
  h = addPlayer(h, { userId: "bob", name: "Bob" });
  h = openVoting(h, 1000);
  h = castVote(h, "alice", ["rock"], 1100);
  ok("not complete with bob connected & not voted", allVoted(h.public) === false);
  h = setConnected(h, "bob", false);
  ok("complete once only-remaining voter (alice) has voted", allVoted(h.public) === true);

  // If EVERY human voter leaves during voting, the deadline path (startFromVote)
  // must recover to the lobby — not start a zombie game with no connected humans.
  let z = createLobby("ROOMOZ", { userId: "alice", name: "Alice" }, {});
  z = addPlayer(z, { userId: "bob", name: "Bob" });
  z = openVoting(z, 1000);
  z = castVote(z, "alice", ["rock"], 1100);
  z = removePlayer(z, "alice");
  z = removePlayer(z, "bob");
  ok("all humans gone during voting", z.public.players.length === 0);
  // A non-empty deck is supplied; the no-connected-humans guard must win anyway.
  const zStarted = startFromVote(z, [0, 1, 2, 3, 4, 5], songs, 2000);
  ok("startFromVote recovers to lobby (no zombie game)", zStarted.public.phase === "lobby");
  ok("votes cleared on zombie recovery", zStarted.public.votes === undefined);
  ok("deadline cleared on zombie recovery", zStarted.public.deadline === undefined);
  ok("no cards dealt on zombie recovery", zStarted.public.players.every((p) => p.timeline.length === 0));
}

// ── Scenario P: late join during voting + seeded-shuffle determinism ────────
console.log("Scenario P (late join + seeded shuffle):");
{
  let g = createLobby("ROOMPP", { userId: "alice", name: "Alice" }, {});
  g = addPlayer(g, { userId: "bob", name: "Bob" });
  g = openVoting(g, 1000);
  // Late joiner is allowed during voting (M5) — no throw.
  let joinThrew = false;
  try {
    g = addPlayer(g, { userId: "dave", name: "Dave" });
  } catch {
    joinThrew = true;
  }
  ok("late join allowed during voting", !joinThrew && g.public.players.some((p) => p.userId === "dave"));
  // The late joiner raises the denominator: previously-complete can become not.
  g = castVote(g, "alice", ["rock"], 1100);
  g = castVote(g, "bob", ["rock"], 1150);
  ok("not complete while late joiner (dave) hasn't voted", allVoted(g.public) === false);

  // Seeded shuffle determinism (the property buildVoteStartOrder relies on):
  // mulberry32(seed) gives an identical permutation on every run.
  const seed = votesHashSeed(g);
  const permute = (s: number) => {
    const arr = Array.from({ length: 30 }, (_, i) => i);
    const rng = mulberry32(s);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  ok("seeded shuffle is deterministic", JSON.stringify(permute(seed)) === JSON.stringify(permute(seed)));
  ok("different seeds differ", JSON.stringify(permute(seed)) !== JSON.stringify(permute(seed + 1)));
}

// ── Scenario Q: theme packs — registry hygiene + scope helpers + playability ─
// Asserts the data model + scope wiring AND that every registered pack has a
// playable deck (>= the 12-song threshold, comfortably above players+MIN_DECK_MARGIN).
console.log("Scenario Q (theme packs / scope):");
{
  // Registry hygiene: every pack id is prefixed and never collides with a genre.
  ok("PACKS non-empty", PACKS.length > 0);
  ok("every PACKS id starts with 'pack:'", PACKS.every((p) => p.id.startsWith(PACK_PREFIX)));
  ok("isPackId agrees with the prefix", PACKS.every((p) => isPackId(p.id)));
  ok("no PACKS id is a genre CATEGORY", PACKS.every((p) => !CATEGORY_IDS.has(p.id)));
  ok("no genre CATEGORY is a pack id", CATEGORIES.every((c) => !isPackId(c.id)));
  ok("PACK_IDS matches PACKS", PACK_IDS.size === PACKS.length && PACKS.every((p) => PACK_IDS.has(p.id)));
  ok("pack ids are unique", new Set(PACKS.map((p) => p.id)).size === PACKS.length);

  // isPackId basics.
  ok("isPackId true for a pack id", isPackId("pack:bz"));
  ok("isPackId false for a genre id", !isPackId("jpop"));

  // resolveScopeFilter — EXCLUSIVE 縛り semantics.
  ok("no pack → genres pass through unchanged",
    JSON.stringify(resolveScopeFilter(["rock", "jazz"])) === JSON.stringify(["rock", "jazz"]));
  ok("a selected pack overrides genres (pack-only)",
    JSON.stringify(resolveScopeFilter(["rock", "pack:bz", "jazz"])) === JSON.stringify(["pack:bz"]));
  ok("multiple packs → only packs kept",
    JSON.stringify(resolveScopeFilter(["pack:bz", "jpop", "pack:lisa"])) === JSON.stringify(["pack:bz", "pack:lisa"]));
  ok("empty scope stays empty (all categories)", resolveScopeFilter([]).length === 0);

  // sanitizeScope — accepts genre + pack ids, drops unknowns, dedups, order-stable.
  ok("sanitizeScope keeps genres", JSON.stringify(sanitizeScope(["rock", "jazz"])) === JSON.stringify(["rock", "jazz"]));
  ok("sanitizeScope keeps pack ids", JSON.stringify(sanitizeScope(["pack:bz"])) === JSON.stringify(["pack:bz"]));
  ok("sanitizeScope keeps mixed pack+genre",
    JSON.stringify(sanitizeScope(["rock", "pack:bz"])) === JSON.stringify(["rock", "pack:bz"]));
  ok("sanitizeScope drops unknown ids",
    JSON.stringify(sanitizeScope(["rock", "pack:__nope__", "bogus", "pack:bz"])) === JSON.stringify(["rock", "pack:bz"]));
  ok("sanitizeScope dedups", JSON.stringify(sanitizeScope(["rock", "rock", "pack:bz", "pack:bz"])) === JSON.stringify(["rock", "pack:bz"]));
  ok("sanitizeScope tolerates non-arrays", sanitizeScope(undefined).length === 0 && sanitizeScope("rock").length === 0);
  ok("sanitizeScope drops non-string entries",
    JSON.stringify(sanitizeScope(["rock", 7, null, "pack:bz"])) === JSON.stringify(["rock", "pack:bz"]));

  // Playability: every registered pack must hold a workable deck. The 12-song
  // threshold sits comfortably above the hard minimum (players + MIN_DECK_MARGIN),
  // so a normal game always has enough mystery cards under a 縛り.
  const PACK_MIN_SONGS = 12;
  for (const p of PACKS) {
    const n = deckSizeForCategories(resolveScopeFilter([p.id]));
    ok(`pack ${p.id} has >= ${PACK_MIN_SONGS} songs (deck=${n})`, n >= PACK_MIN_SONGS);
  }
}

// ── Scenario R: provider plumbing (bilibili cover card) ─────────────────────
// A song with provider:"bilibili" makes needsTrackResolution true until its bvid
// is set, and beginTurn carries provider/isCover into public `current` (never the
// answer). YouTube cards (absent provider) keep their byte-for-byte behavior.
console.log("Scenario R (provider plumbing / bilibili cover):");
{
  // Deck: 0,1 start cards (youtube); index 2 is a BILIBILI cover card.
  const provSongs: Song[] = [
    { title: "Song0", artist: "Artist0", year: 1960 },
    { title: "Song1", artist: "Artist1", year: 1965 },
    {
      title: "OriginalSong",
      artist: "OriginalArtist",
      year: 1985,
      provider: "bilibili",
      bvid: "BV1xx411c7mD",
      coverArtist: "歌い手さん",
      isCover: true,
    },
  ];
  const g = createGame(
    "ROOMRR",
    [{ userId: "alice", name: "Alice" }, { userId: "bob", name: "Bob" }],
    [0, 1, 2],
    provSongs,
    1000,
    { startingTokens: 0 },
  );

  const cur = g.public.current!;
  ok("beginTurn carries provider=bilibili", cur.provider === "bilibili");
  ok("beginTurn carries isCover=true", cur.isCover === true);
  ok("no playable id yet (bvid unset)", cur.bvid === undefined && cur.youtubeId === null);
  ok("needsTrackResolution true until bvid set", needsTrackResolution(g) === true);

  // Anti-cheat: the ORIGINAL answer must NOT be in public state before reveal.
  const pubStr = JSON.stringify(g.public);
  ok("answer year not leaked into public", !pubStr.includes("1985"));
  ok("answer title not leaked into public", !pubStr.includes("OriginalSong"));
  ok("cover singer not leaked into public", !pubStr.includes("歌い手さん"));

  // Server-side resolution would set bvid (mirrored here): then no longer needed.
  cur.bvid = "BV1xx411c7mD";
  ok("needsTrackResolution false once bvid set", needsTrackResolution(g) === false);

  // YouTube path unchanged: a default (absent-provider) card resolves via youtubeId.
  const yt = createGame(
    "ROOMRY",
    [{ userId: "alice", name: "Alice" }, { userId: "bob", name: "Bob" }],
    [0, 1, 2],
    songs, // the original all-YouTube fixture
    1000,
    { startingTokens: 0 },
  );
  ok("youtube card has no provider field (default)", yt.public.current!.provider === undefined);
  ok("youtube card not flagged as cover", yt.public.current!.isCover === undefined);
  ok("youtube needsTrackResolution true (no youtubeId)", needsTrackResolution(yt) === true);
  yt.public.current!.youtubeId = "dQw4w9WgXcQ";
  ok("youtube needsTrackResolution false once id set", needsTrackResolution(yt) === false);
}

// ── Scenario S: anime-quiz bonus (Item 2) ───────────────────────────────────
// Own self-contained Song[] (with categories) so the shared 12-song fixture
// (no categories) — and therefore every assertion above — is entirely unaffected.
console.log("Scenario S (anime-quiz bonus):");
{
  const q: Song[] = [
    { title: "Seed0", artist: "A0", year: 1990 },
    { title: "Seed1", artist: "A1", year: 1991 },
    { title: "Seed2", artist: "A2", year: 1992 },
    { title: "OP", artist: "AOP", year: 2000, categories: ["pack:onepiece"] },
    { title: "NA", artist: "AN", year: 2001, categories: ["pack:naruto"] },
    { title: "MIX", artist: "AM", year: 2002, categories: ["pack:onepiece", "pack:naruto"] },
    { title: "PLAIN", artist: "AP", year: 2003, categories: ["jpop"] },
    { title: "SHOUJO", artist: "AS", year: 2004, categories: ["pack:shoujo-anime"] },
  ];
  let g = createLobby("ROOMQZ", { userId: "alice", name: "Alice" }, {
    startingTokens: 0, allowSkip: false, revealSeconds: 240, earlyBonusMs: 0, placementTokens: 0,
  });
  g = addPlayer(g, { userId: "bob", name: "Bob" });
  g = addPlayer(g, { userId: "carol", name: "Carol" });
  g = startGame(g, [0, 1, 2, 3, 4, 5, 6, 7], q, 1000);
  ok("3 players seeded, no reveal yet", g.public.phase === "placing" && !g.public.reveal);

  // No active quiz yet (no reveal) → answerAnimeQuiz is a pure no-op.
  const prePlacingVersion = g.public.version;
  const noopOutsideReveal = answerAnimeQuiz(g, "alice", "ONE PIECE", q);
  ok("answerAnimeQuiz no-op outside reveal phase", noopOutsideReveal.public.version === prePlacingVersion);

  // Turn1 (alice active, mystery = OP / pack:onepiece): correct placement, no
  // eligible stealers (everyone at 0 tokens) → resolves straight to reveal.
  g = placeCard(g, "alice", 1, undefined, q, 2000);
  ok("turn1 resolved to reveal", g.public.phase === "reveal");
  ok("animeQuiz present for single-franchise pack", !!g.public.reveal!.animeQuiz);
  ok("correct answer is ONE PIECE", g.public.reveal!.animeQuiz!.correct === "ONE PIECE");
  ok("choices include the correct answer", g.public.reveal!.animeQuiz!.choices.includes("ONE PIECE"));
  {
    const n = g.public.reveal!.animeQuiz!.choices.length;
    ok("3-4 choices total", n >= 3 && n <= 4);
    ok("no duplicate choices", new Set(g.public.reveal!.animeQuiz!.choices).size === n);
  }

  // Bob is first to answer correctly → solves it, earns the bonus token.
  g = answerAnimeQuiz(g, "bob", "ONE PIECE", q);
  ok("first correct guesser solves it", g.public.reveal!.animeQuiz!.solvedBy === "bob");
  ok("bob earns the bonus token", g.public.players.find((p) => p.userId === "bob")!.tokens === 1);

  // Alice guesses correctly SECOND → recorded, but no additional bonus.
  const aliceBefore = g.public.players.find((p) => p.userId === "alice")!.tokens;
  g = answerAnimeQuiz(g, "alice", "ONE PIECE", q);
  ok(
    "second correct guess gets no extra bonus",
    g.public.players.find((p) => p.userId === "alice")!.tokens === aliceBefore,
  );
  ok("second guess still recorded", g.public.reveal!.animeQuiz!.answers["alice"] === "ONE PIECE");

  // Carol submits a WRONG (but valid) choice → recorded, no bonus, solvedBy unchanged.
  const wrongChoice = g.public.reveal!.animeQuiz!.choices.find((c) => c !== "ONE PIECE")!;
  g = answerAnimeQuiz(g, "carol", wrongChoice, q);
  ok("wrong guess recorded", g.public.reveal!.animeQuiz!.answers["carol"] === wrongChoice);
  ok("wrong guess doesn't steal solvedBy", g.public.reveal!.animeQuiz!.solvedBy === "bob");
  ok("wrong guess earns no token", g.public.players.find((p) => p.userId === "carol")!.tokens === 0);

  // Re-guessing (already answered) is a no-op (idempotent, no version bump).
  const v = g.public.version;
  g = answerAnimeQuiz(g, "bob", "ONE PIECE", q);
  ok("re-guessing is a no-op", g.public.version === v);

  // Manual "▶ 次の曲へ" (advanceReveal) → turn2 (bob active, mystery = NA / pack:naruto).
  g = advanceReveal(g, q, 300000);
  ok("turn2: bob active", g.public.order[g.public.activeIndex] === "bob");
  g = placeCard(g, "bob", 1, undefined, q, 300100); // bob [1991] + NA(2001) after → correct
  ok("turn2 resolved to reveal (no eligible stealers)", g.public.phase === "reveal");
  ok("turn2 animeQuiz correct is NARUTO", g.public.reveal!.animeQuiz!.correct === "NARUTO");

  // Invalid choice throws for a player who hasn't answered THIS reveal yet.
  let threw = false;
  try {
    answerAnimeQuiz(g, "alice", "NOT_A_REAL_CHOICE", q);
  } catch {
    threw = true;
  }
  ok("invalid choice throws", threw);

  // Non-member guess throws.
  let memberThrew = false;
  try {
    answerAnimeQuiz(g, "mallory", "NARUTO", q);
  } catch {
    memberThrew = true;
  }
  ok("non-member guess throws", memberThrew);

  // Turn3 (carol active, mystery = MIX / TWO franchise packs → ambiguous, no quiz).
  g = advanceReveal(g, q, 400000);
  ok("turn3: carol active", g.public.order[g.public.activeIndex] === "carol");
  g = placeCard(g, "carol", 1, undefined, q, 400100); // carol [1992] + MIX(2002) after → correct
  ok("turn3 opens stealing (bob holds a token)", g.public.phase === "stealing");
  g = passSteal(g, "bob", q, 400200);
  ok("turn3 resolved to reveal", g.public.phase === "reveal");
  ok("ambiguous (2-pack) song has no animeQuiz", g.public.reveal!.animeQuiz === undefined);

  // Turn4 (alice active again, mystery = PLAIN / no franchise pack).
  g = advanceReveal(g, q, 500000);
  ok("turn4: alice active", g.public.order[g.public.activeIndex] === "alice");
  g = placeCard(g, "alice", 2, undefined, q, 500100); // alice [1990,2000] + PLAIN(2003) after → correct
  ok("turn4 opens stealing (bob holds a token)", g.public.phase === "stealing");
  g = passSteal(g, "bob", q, 500200);
  ok("turn4 resolved to reveal", g.public.phase === "reveal");
  ok("non-franchise song has no animeQuiz", g.public.reveal!.animeQuiz === undefined);

  // Turn5 (bob active again, mystery = SHOUJO / pack:shoujo-anime — deliberately
  // excluded from FRANCHISE_PACK_NAMES → no quiz even though it's a single-pack match).
  g = advanceReveal(g, q, 600000);
  ok("turn5: bob active", g.public.order[g.public.activeIndex] === "bob");
  g = placeCard(g, "bob", 2, undefined, q, 600100); // bob [1991,2001] + SHOUJO(2004) after → correct
  ok("turn5 resolved to reveal (no eligible stealers)", g.public.phase === "reveal");
  ok("pack:shoujo-anime has no animeQuiz (mixed-franchise pack)", g.public.reveal!.animeQuiz === undefined);

  // Placement/win-condition bookkeeping is entirely unaffected by the bonus quiz.
  ok(
    "alice's timeline grew normally (turns 1 & 4)",
    g.public.players.find((p) => p.userId === "alice")!.timeline.length === 3,
  );
  ok(
    "bob's timeline grew normally (turns 2 & 5)",
    g.public.players.find((p) => p.userId === "bob")!.timeline.length === 3,
  );
  ok(
    "carol's timeline grew normally (turn 3)",
    g.public.players.find((p) => p.userId === "carol")!.timeline.length === 2,
  );
}

// ── Scenario T: free-skip throttle + opaque mystery cardId ──────────────────
console.log("Scenario T (free-skip cap + opaque cardId):");
{
  let g = createGame(
    "ROOMTT",
    [{ userId: "alice", name: "Alice" }, { userId: "bob", name: "Bob" }],
    Array.from({ length: 12 }, (_, i) => i),
    songs,
    1000,
    { startingTokens: 0 },
  );
  // The public mystery cardId must NOT encode the songId (deck.json is public).
  ok("mystery cardId is opaque (not s<songId>)", !/^s\d+$/.test(g.public.current!.cardId));
  ok("mystery cardId uses opaque prefix", g.public.current!.cardId.startsWith("t"));

  // Up to MAX_FREE_SKIPS_PER_TURN free skips are allowed within one turn.
  for (let i = 0; i < MAX_FREE_SKIPS_PER_TURN; i++) g = systemSkip(g, songs, 2000 + i);
  ok(`${MAX_FREE_SKIPS_PER_TURN} free skips allowed in a turn`, g.public.phase === "placing");

  // The next skip in the SAME turn is rejected (deck-burn / grief guard).
  let threw = false;
  try {
    g = systemSkip(g, songs, 9000);
  } catch {
    threw = true;
  }
  ok("free skip beyond cap rejected", threw);

  // cardId changes on each redraw so skip-song's echo-guard still distinguishes.
  const first = createGame("ROOMT2", [{ userId: "a", name: "A" }, { userId: "b", name: "B" }],
    Array.from({ length: 6 }, (_, i) => i), songs, 1000, { startingTokens: 0 });
  const id1 = first.public.current!.cardId;
  const after = systemSkip(first, songs, 2000);
  ok("cardId changes after a redraw", after.public.current!.cardId !== id1);
}

// ── Scenario U: alias / artistAlias naming match ────────────────────────────
console.log("Scenario U (alias naming match):");
{
  const aliasSongs: Song[] = [
    { title: "A", artist: "AA", year: 1970 },
    { title: "B", artist: "BB", year: 1990 },
    {
      title: "C.R.E.A.M.",
      artist: "Wu-Tang Clan",
      year: 1994,
      aliases: ["Cash Rules Everything Around Me"],
      artistAliases: ["Wu Tang Clan"],
    },
  ];
  // alice [1970]; mystery 2 (C.R.E.A.M., 1994) for alice, original mode.
  let g = createGame(
    "ROOMUU",
    [{ userId: "alice", name: "Alice" }, { userId: "bob", name: "Bob" }],
    [0, 1, 2],
    aliasSongs,
    1000,
    { startingTokens: 0, mode: "original" },
  );
  // Correct placement (after 1970) + answer using the DECK'S OWN alias spellings.
  g = placeCard(
    g,
    "alice",
    1,
    { title: "Cash Rules Everything Around Me", artist: "Wu Tang Clan" },
    aliasSongs,
    2000,
  );
  const award = g.public.reveal!.tokenAwards.find((a) => a.userId === "alice");
  ok("alias title matched", !!award && award.namedTitle === true);
  ok("alias artist matched", !!award && award.namedArtist === true);
  ok("alias title+artist earns the naming token", !!award && award.tokensGained === 1);
  ok("placementCorrect exposed on reveal", g.public.reveal!.placementCorrect === true);
}

console.log(`\nAll ${passed} engine checks passed ✅`);
