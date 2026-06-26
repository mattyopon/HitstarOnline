/**
 * Engine smoke test — exercises the full-rules game engine deterministically.
 * Run with: npm run test:engine   (uses tsx)
 *
 * No network or Supabase needed; this validates pure game logic.
 */
import assert from "node:assert";
import {
  createLobby,
  addPlayer,
  addBot,
  startGame,
  placeCard,
  stealCard,
  skipSong,
  buyCard,
  advance,
  isPlacementCorrect,
} from "../src/lib/engine";
import { Song } from "../src/lib/protocol";

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
  // Before deadline: advance is a no-op.
  const before = advance(g, songs, dl - 1);
  ok("advance before deadline is no-op", before.public.version === g.public.version);
  // After deadline: placing times out → reveal with no award.
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

console.log(`\nAll ${passed} engine checks passed ✅`);
