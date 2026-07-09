// ───────────────────────────────────────────────────────────────────────────
// Hitstar game engine — pure, deterministic state machine for full Hitster
// rules (timeline placement, token economy, stealing, win condition).
//
// All transitions take the current FullGame and return a NEW FullGame (never
// mutate input). Time is injected as `now` (epoch ms) so the engine stays pure
// and unit-testable. Randomness (deck shuffle) is injected as `deckOrder`.
//
// FullGame = { public, secret }. Only `public` is ever sent to clients; it
// never contains the unrevealed answer (title/artist/year) of the current card.
// ───────────────────────────────────────────────────────────────────────────

import {
  ANIME_QUIZ_BONUS_TOKENS,
  AnimeQuizInfo,
  BOT_NAMES,
  BOT_PROFILES,
  BotDifficulty,
  BotProfile,
  CATEGORIES,
  CATEGORY_IDS,
  DEFAULT_SETTINGS,
  FRANCHISE_PACK_NAMES,
  FullGame,
  GameSettings,
  MODE_START_TOKENS,
  PlayerSeed,
  PublicPlayer,
  PublicState,
  SecretState,
  Song,
  TimelineCard,
  VOTE_DURATION_SECONDS,
  deckKeyOf,
  defaultSettings,
  franchiseForCategories,
} from "./protocol";
import { looseMatch } from "./matching";

export class GameError extends Error {}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

function cardId(songId: number): string {
  return `s${songId}`;
}

/** Opaque public id for the CURRENT (unrevealed) mystery card. Derived from the
 *  server-only draw position so it can't be reversed to the songId, yet is
 *  deterministic per state (CAS-safe) and unique per (re)draw. */
function mysteryCardId(g: FullGame): string {
  return `t${(hash32(`${g.public.code}|${g.secret.drawPos}`) >>> 0).toString(36)}`;
}

function materialize(songId: number, songs: Song[]): TimelineCard {
  const s = songs[songId];
  if (!s) throw new GameError(`unknown songId ${songId}`);
  return { id: cardId(songId), songId, title: s.title, artist: s.artist, year: s.year };
}

function sortTimeline(t: TimelineCard[]): TimelineCard[] {
  return [...t].sort((a, b) => a.year - b.year || a.songId - b.songId);
}

/** Is placing a card of `year` at `slotIndex` (0..len) of `timeline` correct? */
export function isPlacementCorrect(
  timeline: TimelineCard[],
  slotIndex: number,
  year: number,
): boolean {
  if (slotIndex < 0 || slotIndex > timeline.length) return false;
  const left = slotIndex > 0 ? timeline[slotIndex - 1] : null;
  const right = slotIndex < timeline.length ? timeline[slotIndex] : null;
  if (left && year < left.year) return false;
  if (right && year > right.year) return false;
  return true;
}

function activePlayer(state: PublicState): PublicPlayer {
  const uid = state.order[state.activeIndex];
  const p = state.players.find((x) => x.userId === uid);
  if (!p) throw new GameError("active player not found");
  return p;
}

function getPlayer(state: PublicState, userId: string): PublicPlayer {
  const p = state.players.find((x) => x.userId === userId);
  if (!p) throw new GameError("player not in room");
  return p;
}

function eligibleStealers(state: PublicState): PublicPlayer[] {
  const activeUid = state.order[state.activeIndex];
  const already = new Set(state.steals.map((s) => s.userId));
  // Any timeline always has len+1 placement slots, so an eligible stealer always
  // has somewhere to place — the only gates are turn/connection/tokens/not-yet-acted.
  return state.players.filter(
    (p) =>
      p.userId !== activeUid &&
      p.connected &&
      p.tokens > 0 &&
      !already.has(p.userId),
  );
}

// ── Timing accessors (fall back to DEFAULT_SETTINGS for old persisted rooms) ──
export function listenMs(s: GameSettings): number {
  return (s.listenSeconds ?? DEFAULT_SETTINGS.listenSeconds) * 1000;
}
export function placeMs(s: GameSettings): number {
  return (s.placementSeconds ?? DEFAULT_SETTINGS.placementSeconds) * 1000;
}
function stealMs(s: GameSettings): number {
  return (s.stealSeconds ?? DEFAULT_SETTINGS.stealSeconds) * 1000;
}
function earlyMs(s: GameSettings): number {
  return s.earlyBonusMs ?? DEFAULT_SETTINGS.earlyBonusMs;
}
function earlyTokens(s: GameSettings): number {
  return s.earlyBonusTokens ?? DEFAULT_SETTINGS.earlyBonusTokens;
}

/** True once every still-eligible (token-holding, connected) opponent has
 *  decided steal-or-pass — lets the steal phase end before its 10s deadline. */
function allStealersDecided(state: PublicState): boolean {
  const decisions = state.stealerDecisions ?? {};
  return eligibleStealers(state).every((p) => decisions[p.userId] !== undefined);
}

// ─── Lobby ──────────────────────────────────────────────────────────────────

export function createLobby(
  code: string,
  host: PlayerSeed,
  settings: Partial<GameSettings> = {},
): FullGame {
  const merged = { ...defaultSettings(), ...settings };
  // Starting tokens follow the mode unless explicitly overridden.
  if (settings.startingTokens === undefined) {
    merged.startingTokens = MODE_START_TOKENS[merged.mode];
  }
  const pub: PublicState = {
    version: 1,
    phase: "lobby",
    code,
    hostId: host.userId,
    players: [
      {
        userId: host.userId,
        name: host.name,
        avatarUrl: host.avatarUrl ?? null,
        seat: 0,
        tokens: merged.startingTokens,
        connected: true,
        timeline: [],
      },
    ],
    order: [host.userId],
    activeIndex: 0,
    round: 0,
    settings: merged,
    steals: [],
    deckRemaining: 0,
  };
  return { public: pub, secret: { deck: [], drawPos: 0 } };
}

export function addPlayer(game: FullGame, seed: PlayerSeed): FullGame {
  // Redundant join of an already-present, already-connected player with the same
  // name/avatar is a true no-op (don't bump version → no realtime thrash / no
  // race with an in-progress solo game). Mirrors setConnected's early return.
  const cur = game.public.players.find((p) => p.userId === seed.userId);
  if (
    cur &&
    cur.connected &&
    cur.name === seed.name &&
    (cur.avatarUrl ?? null) === (seed.avatarUrl ?? null)
  ) {
    return game;
  }

  const g = clone(game);
  // Brand-new joins are allowed only while pre-game (lobby OR the genre vote);
  // mid-game only existing members may reconnect.
  const joinable = g.public.phase === "lobby" || g.public.phase === "voting";
  if (!joinable) {
    // Allow rejoin if already a member (reconnect); otherwise reject.
    const existing = g.public.players.find((p) => p.userId === seed.userId);
    if (existing) {
      existing.connected = true;
      existing.name = seed.name;
      existing.avatarUrl = seed.avatarUrl ?? existing.avatarUrl ?? null;
      g.public.version++;
      return g;
    }
    throw new GameError("ゲームが既に開始されているため参加できません");
  }
  if (g.public.players.some((p) => p.userId === seed.userId)) {
    const existing = getPlayer(g.public, seed.userId);
    existing.connected = true;
    existing.name = seed.name;
    g.public.version++;
    return g;
  }
  if (g.public.players.length >= 10) throw new GameError("部屋が満員です（最大10人）");
  g.public.players.push({
    userId: seed.userId,
    name: seed.name,
    avatarUrl: seed.avatarUrl ?? null,
    seat: g.public.players.length,
    tokens: g.public.settings.startingTokens,
    connected: true,
    timeline: [],
  });
  g.public.order.push(seed.userId);
  g.public.version++;
  return g;
}

/** Add an NPC (bot) player. Lobby only. Bots live only in state/secret. */
export function addBot(game: FullGame, difficulty: BotDifficulty): FullGame {
  const g = clone(game);
  if (g.public.phase !== "lobby") throw new GameError("ゲーム開始後はNPCを追加できません");
  if (g.public.players.length >= 10) throw new GameError("部屋が満員です（最大10人）");
  const seat = g.public.players.length;
  const botId = `bot:${g.public.code}:${seat}`;
  g.public.players.push({
    userId: botId,
    name: `BOT ${BOT_NAMES[seat % BOT_NAMES.length]}`,
    avatarUrl: null,
    seat,
    tokens: g.public.settings.startingTokens,
    connected: true,
    isBot: true,
    timeline: [],
  });
  g.public.order.push(botId);
  if (!g.secret.bots) g.secret.bots = {};
  g.secret.bots[botId] = { difficulty };
  g.public.version++;
  return g;
}

export function isBot(p: PublicPlayer): boolean {
  return p.isBot === true;
}

export function removePlayer(game: FullGame, userId: string): FullGame {
  const g = clone(game);
  const idx = g.public.players.findIndex((p) => p.userId === userId);
  if (idx === -1) return game;

  // A departing player's genre vote must not keep counting (or block completion).
  if (g.public.votes && userId in g.public.votes) delete g.public.votes[userId];

  // Pre-game (lobby OR the genre vote): fully remove the player and re-seat the
  // rest. During "voting" no hands are dealt and no turns rotate, so there is no
  // reason to keep a disconnected ghost around — leaving them in would also let
  // the vote-deadline backstop start a "zombie" game with no connected humans.
  if (g.public.phase === "lobby" || g.public.phase === "voting") {
    g.public.players.splice(idx, 1);
    g.public.players.forEach((p, i) => (p.seat = i));
    g.public.order = g.public.players.map((p) => p.userId);
    if (g.public.hostId === userId && g.public.players[0]) {
      g.public.hostId = g.public.players[0].userId;
    }
    g.public.version++;
    return g;
  }

  // Mid-game: keep them in order (so turns rotate predictably) but mark gone.
  const p = g.public.players[idx];
  p.connected = false;
  if (g.public.hostId === userId) {
    const nextHost = g.public.players.find((x) => x.connected);
    if (nextHost) g.public.hostId = nextHost.userId;
  }
  g.public.version++;
  return g;
}

export function setConnected(game: FullGame, userId: string, connected: boolean): FullGame {
  const g = clone(game);
  const p = g.public.players.find((x) => x.userId === userId);
  if (!p) return game;
  if (p.connected === connected) return game;
  p.connected = connected;
  g.public.version++;
  return g;
}

// ─── Game start ───────────────────────────────────────────────────────────--

function drawNext(secret: SecretState): number | null {
  if (secret.drawPos >= secret.deck.length) return null;
  const songId = secret.deck[secret.drawPos];
  secret.drawPos += 1;
  return songId;
}

/** Map a stored deck index (rawId) to the CURRENT songs[] index, correcting for
 *  a deck.json redeploy that shifted array positions. Uses the captured deckKey:
 *  fast path when songs[rawId] still matches; otherwise finds the song that
 *  still carries the key. Falls back to rawId when there's no captured key
 *  (room predates this feature) or the song was removed from the deck. */
function resolveDeckIndex(rawId: number, key: string | undefined, songs: Song[]): number {
  if (!key) return rawId; // backward compat: index-only room
  const cur = songs[rawId];
  if (cur && deckKeyOf(cur.title, cur.artist) === key) return rawId; // unchanged
  const found = songs.findIndex((s) => deckKeyOf(s.title, s.artist) === key);
  return found >= 0 ? found : rawId; // removed from deck → best-effort index
}

/** The current mystery card's index in the CURRENT songs[], re-resolved from its
 *  captured deckKey so a mid-turn deck redeploy can't desync the reveal answer. */
function currentResolvedSongId(g: FullGame, songs: Song[]): number | undefined {
  const raw = g.secret.currentSongId;
  if (raw === undefined) return undefined;
  return resolveDeckIndex(raw, g.secret.currentDeckKey, songs);
}

/** Begin a turn: draw the mystery card and open the placing phase.
 *  The mystery card's answer (title/artist/year) is materialized lazily at
 *  reveal; only non-answer playback hints (provider/isCover) are copied here so
 *  the right player can be selected and the cover banner shown. */
function beginTurn(g: FullGame, songs: Song[], now: number): void {
  const rawSongId = drawNext(g.secret);
  if (rawSongId === null) {
    endGame(g);
    return;
  }
  // Correct the raw deck index against its captured deckKey so a deck.json
  // redeploy that shifted array positions still draws the intended song.
  const songId = resolveDeckIndex(rawSongId, g.secret.deckKeys?.[g.secret.drawPos - 1], songs);
  g.secret.currentSongId = songId;
  const drawn = songs[songId];
  // Remember the current card's key so the reveal can re-resolve it even if the
  // deck is redeployed mid-turn (between this draw and the reveal request).
  g.secret.currentDeckKey = drawn ? deckKeyOf(drawn.title, drawn.artist) : undefined;
  const provider = drawn?.provider ?? "youtube";
  g.public.current = {
    // Opaque per-draw token — NOT derivable to the songId. Publishing `s<songId>`
    // would leak the answer (deck.json is public in the repo, so an index maps
    // straight to title/artist/year). drawPos is server-only, so hashing it hides
    // the identity while staying deterministic under CAS retries and changing on
    // every (re)draw so skip-song's echo-guard still distinguishes cards.
    cardId: mysteryCardId(g),
    youtubeId: null,
    startSeconds: g.public.settings.startSeconds,
    startedAt: now,
    // Carry the (non-answer) playback hints. For a bilibili card the playable id
    // (bvid) is left null/absent here and resolved server-side, mirroring how the
    // YouTube id is resolved later — engine purity is preserved.
    ...(provider === "bilibili" ? { provider, isCover: drawn?.isCover ?? false } : {}),
  };
  g.public.placement = undefined;
  g.public.guess = undefined;
  g.public.steals = [];
  g.public.stealOpenedAt = undefined;
  g.public.stealerDecisions = undefined;
  g.public.reveal = undefined;

  // Listening window: song plays listenSeconds, then placementSeconds to place.
  const s = g.public.settings;
  g.public.listenStartedAt = now;
  g.public.listenDurationMs = listenMs(s);
  g.public.listeningExtended = false;
  g.public.listeningEndedAt = null;
  g.public.earlyBonusAwarded = false;
  g.public.earlyBonusGained = 0;
  g.public.placementDeadline = now + listenMs(s) + placeMs(s);

  g.public.phase = "placing";
  g.public.deadline = g.public.placementDeadline;
  g.public.deckRemaining = g.secret.deck.length - g.secret.drawPos;
}

export function startGame(game: FullGame, deckOrder: number[], songs: Song[], now: number): FullGame {
  const g = clone(game);
  // Startable from the lobby OR from the genre-vote phase (vote → game).
  if (g.public.phase !== "lobby" && g.public.phase !== "voting") {
    throw new GameError("ゲームは既に開始されています");
  }
  const n = g.public.players.length;
  if (n < 1) throw new GameError("プレイヤーがいません");
  if (deckOrder.length < n + 1) throw new GameError("曲が足りません");

  // Genre votes only matter pre-game; never leak them into in-game state.
  delete g.public.votes;

  g.secret.deck = [...deckOrder];
  // Capture each draw position's deckKey so a later deck.json redeploy that
  // shifts array indices can't desync this game's questions/answers.
  g.secret.deckKeys = deckOrder.map((i) => {
    const s = songs[i];
    return s ? deckKeyOf(s.title, s.artist) : "";
  });
  g.secret.drawPos = 0;

  // Deal one starting card to each player (revealed on their timeline).
  for (const p of g.public.players) {
    const songId = drawNext(g.secret);
    if (songId === null) throw new GameError("曲が足りません");
    p.timeline = [materialize(songId, songs)];
    p.tokens = g.public.settings.startingTokens;
  }

  g.public.activeIndex = 0;
  g.public.round = 1;
  beginTurn(g, songs, now);
  g.public.version++;
  return g;
}

/** Convenience for tests: build a full game from seeds and start it. */
export function createGame(
  code: string,
  seeds: PlayerSeed[],
  deckOrder: number[],
  songs: Song[],
  now: number,
  settings: Partial<GameSettings> = {},
): FullGame {
  let g = createLobby(code, seeds[0], settings);
  for (const s of seeds.slice(1)) g = addPlayer(g, s);
  return startGame(g, deckOrder, songs, now);
}

// ─── Genre majority-vote (phase "voting") ─────────────────────────────────--
// When 2+ humans are in a room the host opens a vote instead of starting the
// game directly; every connected human votes for genre categories and the
// majority winner builds the deck. Everything here is pure: the deck shuffle
// (which needs the server-only deck) is built by the route from voteWinner +
// votesHashSeed and handed to startFromVote, so CAS retries stay deterministic.

/** Connected, present, non-bot players — the only eligible voters/tally base. */
function humanVoters(state: PublicState): PublicPlayer[] {
  return state.players.filter((p) => p.connected && !isBot(p));
}

/**
 * Open the genre vote (lobby → voting). Precondition: at least 2 CONNECTED
 * non-bot humans (M4) — bots never vote. Idempotent-ish: throws on misuse so
 * the host route surfaces a clear error.
 */
export function openVoting(game: FullGame, now: number): FullGame {
  const g = clone(game);
  if (g.public.phase !== "lobby") throw new GameError("今は投票を開始できません");
  if (humanVoters(g.public).length < 2) {
    throw new GameError("投票には2人以上の参加者が必要です");
  }
  g.public.phase = "voting";
  g.public.votes = {};
  g.public.deadline = now + VOTE_DURATION_SECONDS * 1000;
  g.public.version++;
  return g;
}

/** Filter a raw category-id list to valid ids, de-duplicated, order-stable. */
function sanitizeVote(cats: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of cats) {
    if (CATEGORY_IDS.has(c) && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

/**
 * Cast (or change) a player's vote. No-op (no version bump) when not in the
 * voting phase (M1/late tap) or when the vote is unchanged (S2). Only present,
 * connected, non-bot members may vote.
 */
export function castVote(game: FullGame, userId: string, cats: string[], _now: number): FullGame {
  if (game.public.phase !== "voting") return game; // late/duplicate tap → benign
  const voter = game.public.players.find((p) => p.userId === userId);
  if (!voter || isBot(voter) || !voter.connected) {
    throw new GameError("投票できません");
  }
  const next = sanitizeVote(cats);
  const cur = game.public.votes?.[userId];
  // Identical re-vote → no-op (avoid realtime churn). Order is significant here
  // only as a stable signal; sanitizeVote keeps caller order.
  if (cur && cur.length === next.length && cur.every((c, i) => c === next[i])) {
    return game;
  }
  const g = clone(game);
  if (!g.public.votes) g.public.votes = {};
  g.public.votes[userId] = next;
  g.public.version++;
  return g;
}

/** True once every eligible (connected, non-bot) voter has cast a vote AND at
 *  least one vote exists. Pure optimization for early start; the deadline is the
 *  authoritative backstop (M6). */
export function allVoted(state: PublicState): boolean {
  const voters = humanVoters(state);
  if (voters.length === 0) return false;
  const votes = state.votes ?? {};
  let any = false;
  for (const p of voters) {
    if (!(p.userId in votes)) return false;
    any = true;
  }
  return any;
}

/** Deterministic seed for the vote-driven shuffle and tie-break. Folds version
 *  so retries within one transition agree but successive votes/rematches differ
 *  (S4). Evaluated on the PRE-start game (round is still 0 during voting). */
export function votesHashSeed(g: FullGame): number {
  return hash32(`${g.public.code}:${g.public.round}:${g.public.version}`);
}

/**
 * Tally the votes (only from present, connected, non-bot players) and return the
 * winning category ids. Each player's ballot is a list; every listed category
 * gets one point. Returns:
 *   - the set of categories tied for the most points (deterministically chosen
 *     winner list), or
 *   - [] when nobody voted → "all categories" (M8), NOT settings.categories.
 */
export function voteWinner(g: FullGame): string[] {
  const voters = new Set(humanVoters(g.public).map((p) => p.userId));
  const votes = g.public.votes ?? {};
  const tally = new Map<string, number>();
  for (const [uid, cats] of Object.entries(votes)) {
    if (!voters.has(uid)) continue; // ignore departed/bot/disconnected voters
    for (const c of cats) {
      if (CATEGORY_IDS.has(c)) tally.set(c, (tally.get(c) ?? 0) + 1);
    }
  }
  if (tally.size === 0) return []; // all-abstain → all categories
  let max = 0;
  for (const v of tally.values()) if (v > max) max = v;
  // Stable, deterministic order: canonical CATEGORIES order, max-count only.
  return CATEGORIES.map((c) => c.id).filter((id) => tally.get(id) === max);
}

/**
 * Start the game from the voting phase using a deck order the CALLER built from
 * voteWinner + votesHashSeed (deck access is server-only). Idempotent and
 * phase-guarded (M1): a no-op if not in voting, so the double-start race
 * (last-voter vs. deadline-advance) is benign under CAS. If the supplied deck is
 * too small even after the caller's all-categories fallback, return to the lobby
 * (clearing votes) rather than throwing an unrecoverable error (M7).
 */
export function startFromVote(game: FullGame, deckOrder: number[], songs: Song[], now: number): FullGame {
  if (game.public.phase !== "voting") return game; // already started / not voting

  // Everyone left during the vote (only bots / disconnected remain) → there is
  // nobody to play, so recover to the lobby instead of starting a zombie game.
  // No connected non-bot human → return-to-lobby recovery (same as the M7 path).
  if (humanVoters(game.public).length === 0) {
    const g = clone(game);
    g.public.phase = "lobby";
    delete g.public.votes;
    g.public.deadline = undefined;
    g.public.version++;
    return g;
  }

  const n = game.public.players.length;
  if (deckOrder.length < n + 1) {
    // Even the fallback deck can't seat everyone → recover to lobby.
    const g = clone(game);
    g.public.phase = "lobby";
    delete g.public.votes;
    g.public.deadline = undefined;
    g.public.version++;
    return g;
  }
  return startGame(game, deckOrder, songs, now);
}

// ─── Turn actions ─────────────────────────────────────────────────────────--

export function placeCard(
  game: FullGame,
  userId: string,
  slotIndex: number,
  guess: { title?: string; artist?: string } | undefined,
  songs: Song[],
  now: number,
): FullGame {
  const g = clone(game);
  if (g.public.phase !== "placing") throw new GameError("今は配置できません");
  const active = activePlayer(g.public);
  if (active.userId !== userId) throw new GameError("あなたの番ではありません");
  if (slotIndex < 0 || slotIndex > active.timeline.length) throw new GameError("配置位置が不正です");

  const s = g.public.settings;
  const song = songs[currentResolvedSongId(g, songs) ?? -1];

  // Submitting ends the listening window (music stops) if still listening.
  if (g.public.listeningEndedAt == null) g.public.listeningEndedAt = now;

  g.public.placement = { slotIndex };
  g.public.guess = guess && (guess.title || guess.artist) ? { ...guess } : undefined;

  // Early-placement bonus: correct AND within earlyBonusMs of the song START.
  const start = g.public.listenStartedAt ?? g.public.current?.startedAt ?? now;
  const correct = !!song && isPlacementCorrect(active.timeline, slotIndex, song.year);
  if (correct && now - start <= earlyMs(s) && !g.public.earlyBonusAwarded) {
    const before = active.tokens;
    active.tokens = Math.min(s.maxTokens, before + earlyTokens(s));
    g.public.earlyBonusGained = active.tokens - before; // actual gain (0..earlyTokens)
    g.public.earlyBonusAwarded = true;
  }

  // Open stealing if anyone can; otherwise resolve immediately.
  if (eligibleStealers(g.public).length > 0) {
    g.public.phase = "stealing";
    g.public.deadline = now + stealMs(s);
    g.public.stealOpenedAt = now;
    g.public.stealerDecisions = {};
    g.public.version++;
    return g;
  }
  resolve(g, songs, now);
  g.public.version++;
  return g;
}

/** Extend the listening window (一回のみ / one-time per turn, shared by the room).
 *  The ACTIVE player pays extendCost; any other CONNECTED member listening along
 *  extends for FREE (no placement advantage to buy — they just want to keep
 *  hearing the song). Both paths consume the single listeningExtended flag, so
 *  a turn never stretches beyond one extension total. */
export function extendListening(game: FullGame, userId: string, now: number): FullGame {
  const g = clone(game);
  const s = g.public.settings;
  if (g.public.phase !== "placing") throw new GameError("今は試聴を延長できません");
  if (!(s.allowExtend ?? DEFAULT_SETTINGS.allowExtend)) throw new GameError("試聴延長は無効です");
  const active = activePlayer(g.public);
  const requester = g.public.players.find((p) => p.userId === userId);
  if (!requester) throw new GameError("この部屋のメンバーではありません");
  const isActiveReq = active.userId === userId;
  if (!isActiveReq && !requester.connected) {
    throw new GameError("切断中は試聴を延長できません");
  }
  if (g.public.listeningExtended) throw new GameError("試聴延長は1回までです");

  const start = g.public.listenStartedAt ?? g.public.current?.startedAt ?? now;
  const dur = g.public.listenDurationMs ?? listenMs(s);
  if (now >= start + dur || g.public.listeningEndedAt != null) {
    throw new GameError("試聴は既に終了しました");
  }
  const cost = isActiveReq ? s.extendCost ?? DEFAULT_SETTINGS.extendCost : 0;
  if (requester.tokens < cost) throw new GameError("トークンが足りません");

  requester.tokens -= cost;
  g.public.listeningExtended = true;
  g.public.listenDurationMs = dur + (s.extendSeconds ?? DEFAULT_SETTINGS.extendSeconds) * 1000;
  // Placement deadline shifts with the longer listening window; the early-bonus
  // cutoff (start + earlyMs) is UNCHANGED — it is measured from the song start.
  g.public.placementDeadline = start + g.public.listenDurationMs + placeMs(s);
  g.public.deadline = g.public.placementDeadline;
  g.public.version++;
  return g;
}

export function skipSong(game: FullGame, userId: string, songs: Song[], now: number): FullGame {
  const g = clone(game);
  if (g.public.phase !== "placing") throw new GameError("今はスキップできません");
  if (!g.public.settings.allowSkip) throw new GameError("スキップは無効です");
  const active = activePlayer(g.public);
  if (active.userId !== userId) throw new GameError("あなたの番ではありません");
  if (active.tokens <= 0) throw new GameError("トークンが足りません");
  if (g.secret.drawPos >= g.secret.deck.length) throw new GameError("曲が残っていません");
  active.tokens -= 1;
  beginTurn(g, songs, now);
  g.public.version++;
  return g;
}

/** Max free (no-token) system skips allowed within a single turn. Generous
 *  enough for "a few players can't play this track" yet low enough that nobody
 *  can burn the whole deck to force an early game-over/win. */
export const MAX_FREE_SKIPS_PER_TURN = 5;

/** Free "system" skip of the current song: redraw the mystery card with no
 *  token cost and no turn change. No-op outside the placing phase. Used for
 *  unplayable tracks and for the free skip button (any participant).
 *  Throttled per turn (MAX_FREE_SKIPS_PER_TURN) so nobody can spam the deck to
 *  exhaustion and force a standings-based win. */
export function systemSkip(game: FullGame, songs: Song[], now: number): FullGame {
  if (game.public.phase !== "placing") return game;
  const g = clone(game);
  // Lazily reset the counter when a real new turn (round) began.
  if (g.secret.skipRound !== g.public.round) {
    g.secret.skipRound = g.public.round;
    g.secret.skipCount = 0;
  }
  if ((g.secret.skipCount ?? 0) >= MAX_FREE_SKIPS_PER_TURN) {
    throw new GameError("このターンのスキップ上限に達しました");
  }
  g.secret.skipCount = (g.secret.skipCount ?? 0) + 1;
  const savedRound = g.secret.skipRound;
  const savedCount = g.secret.skipCount;
  beginTurn(g, songs, now);
  // beginTurn doesn't touch these, but keep them explicit against future churn.
  g.secret.skipRound = savedRound;
  g.secret.skipCount = savedCount;
  g.public.version++;
  return g;
}

/**
 * Buy the current card: pay `buyCost` tokens to auto-place it at its correct
 * slot, no guessing and no challenge. Counts toward the win.
 */
export function buyCard(game: FullGame, userId: string, songs: Song[], now: number): FullGame {
  const g = clone(game);
  if (g.public.phase !== "placing") throw new GameError("今は購入できません");
  const active = activePlayer(g.public);
  if (active.userId !== userId) throw new GameError("あなたの番ではありません");
  const cost = g.public.settings.buyCost;
  if (active.tokens < cost) throw new GameError(`トークンが足りません（${cost}枚必要）`);
  const songId = currentResolvedSongId(g, songs);
  if (songId === undefined) throw new GameError("購入できる曲がありません");
  const song = songs[songId];
  const animeQuiz = buildAnimeQuiz(song, g.public);

  active.tokens -= cost;
  const slot = correctSlot(active.timeline, song.year);
  const card = materialize(songId, songs);
  active.timeline = sortTimeline([...active.timeline, card]);

  g.public.reveal = {
    songId,
    title: song.title,
    artist: song.artist,
    year: song.year,
    youtubeId: g.public.current?.youtubeId ?? null,
    // Carry playback provider/ids + cover flavor so reveal can play in full
    // (current is cleared just below). Never adds an answer beyond what reveal
    // already exposes.
    ...(g.public.current?.provider === "bilibili"
      ? {
          provider: "bilibili" as const,
          bvid: g.public.current?.bvid,
          isCover: g.public.current?.isCover,
          coverArtist: song.coverArtist,
        }
      : {}),
    placementSlot: slot,
    activeCorrect: true,
    placementCorrect: true,
    awardedTo: active.userId,
    bought: true,
    steals: [],
    tokenAwards: [],
    ...(animeQuiz ? { animeQuiz } : {}),
    reason: "カード購入",
  };
  g.public.current = undefined;
  g.public.phase = "reveal";
  g.public.deadline = now + g.public.settings.revealSeconds * 1000;
  checkWin(g, active.userId);
  g.public.version++;
  return g;
}

export function stealCard(
  game: FullGame,
  userId: string,
  slotIndex: number,
  songs: Song[],
  now: number,
): FullGame {
  const g = clone(game);
  if (g.public.phase !== "stealing") throw new GameError("今は横取りできません");
  const active = activePlayer(g.public);
  if (userId === active.userId) throw new GameError("自分の番では横取りできません");
  const p = getPlayer(g.public, userId);
  if (p.tokens <= 0) throw new GameError("トークンが足りません");
  if (g.public.steals.some((s) => s.userId === userId)) throw new GameError("既に横取り済みです");
  if (slotIndex < 0 || slotIndex > p.timeline.length) throw new GameError("配置位置が不正です");

  p.tokens -= 1;
  g.public.steals.push({ userId, slotIndex, at: now });
  g.public.stealerDecisions = g.public.stealerDecisions ?? {};
  g.public.stealerDecisions[userId] = "steal";

  // Resolve once every still-eligible opponent has decided (stolen or passed).
  if (allStealersDecided(g.public)) {
    resolve(g, songs, now);
  }
  g.public.version++;
  return g;
}

/** Decline to steal. When every eligible stealer has decided, resolve early. */
export function passSteal(game: FullGame, userId: string, songs: Song[], now: number): FullGame {
  const g = clone(game);
  if (g.public.phase !== "stealing") throw new GameError("今は横取りをスキップできません");
  const active = activePlayer(g.public);
  if (userId === active.userId) throw new GameError("自分の番では横取りをスキップできません");
  const p = getPlayer(g.public, userId);
  if (p.tokens <= 0) throw new GameError("横取り対象ではありません");
  if (g.public.steals.some((x) => x.userId === userId)) throw new GameError("既に横取り済みです");
  if (g.public.stealerDecisions?.[userId]) throw new GameError("既に決定済みです");

  g.public.stealerDecisions = g.public.stealerDecisions ?? {};
  g.public.stealerDecisions[userId] = "pass";

  if (allStealersDecided(g.public)) {
    resolve(g, songs, now);
  }
  g.public.version++;
  return g;
}

// ─── Resolution ─────────────────────────────────────────────────────────────

function correctSlot(timeline: TimelineCard[], year: number): number {
  for (let i = 0; i <= timeline.length; i++) {
    if (isPlacementCorrect(timeline, i, year)) return i;
  }
  return timeline.length;
}

/** Earned cards (excludes the starting seed card). Shared with stats.ts. */
export function wonCards(p: PublicPlayer): number {
  return Math.max(0, p.timeline.length - 1);
}

function checkWin(g: FullGame, userId: string): void {
  const p = getPlayer(g.public, userId);
  if (wonCards(p) >= g.public.settings.targetCards) {
    g.public.winnerId = userId;
  }
}

/** Build the optional bonus quiz for a reveal, or undefined if `song` isn't in
 *  exactly one single-franchise pack. Pure & deterministic — seeded from
 *  (code, round) so a mutateByCode CAS retry reconstructs the SAME quiz. */
function buildAnimeQuiz(song: Song, state: PublicState): AnimeQuizInfo | undefined {
  const correct = franchiseForCategories(song.categories);
  if (!correct) return undefined;
  const rng = mulberry32(hash32(`${state.code}|${state.round}|animequiz`));
  const decoyPool = Object.values(FRANCHISE_PACK_NAMES).filter((n) => n !== correct);
  for (let i = decoyPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [decoyPool[i], decoyPool[j]] = [decoyPool[j], decoyPool[i]];
  }
  const decoyCount = Math.min(decoyPool.length, 2 + Math.floor(rng() * 2)); // 2 or 3
  const choices = [correct, ...decoyPool.slice(0, decoyCount)];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return { choices, correct, answers: {}, solvedBy: null };
}

function resolve(g: FullGame, songs: Song[], now: number): void {
  const songId = currentResolvedSongId(g, songs);
  if (songId === undefined) throw new GameError("解決できる曲がありません");
  const song = songs[songId];
  const animeQuiz = buildAnimeQuiz(song, g.public);
  const mode = g.public.settings.mode;
  const active = activePlayer(g.public);
  const placementSlot = g.public.placement?.slotIndex ?? null;
  const placementCorrect =
    placementSlot !== null && isPlacementCorrect(active.timeline, placementSlot, song.year);

  // Optional naming (active player). Original: earns a token if BOTH correct.
  // Accept any of the deck's alternate titles/artist spellings (aliases /
  // artistAliases) so cross-language/romanized/acronym-expanded answers that the
  // deck itself provides are not scored wrong.
  const titleForms = [song.title, ...(song.aliases ?? [])];
  const artistForms = [song.artist, ...(song.artistAliases ?? [])];
  const namedTitle = titleForms.some((t) => looseMatch(g.public.guess?.title, t));
  const namedArtist = artistForms.some((a) => looseMatch(g.public.guess?.artist, a));
  const namedBoth = namedTitle && namedArtist;

  const tokenAwards = [];
  if (g.public.guess && (g.public.guess.title || g.public.guess.artist)) {
    const tokensGained = mode === "original" && namedBoth ? 1 : 0;
    if (tokensGained > 0) {
      active.tokens = Math.min(g.public.settings.maxTokens, active.tokens + tokensGained);
    }
    tokenAwards.push({ userId: active.userId, namedTitle, namedArtist, tokensGained });
  }

  // Early-placement bonus tokens were already credited in placeCard; record the
  // award here so the reveal can show it (using the ACTUAL capped gain, not the
  // nominal earlyBonusTokens). Skip a zero gain (player was already at the cap).
  if (g.public.earlyBonusAwarded) {
    const gained = g.public.earlyBonusGained ?? earlyTokens(g.public.settings);
    if (gained > 0) {
      tokenAwards.push({
        userId: active.userId,
        namedTitle: false,
        namedArtist: false,
        tokensGained: gained,
        reason: "早置きボーナス",
      });
    }
  }

  // Correct-placement reward: the active player gains a token EVERY turn their
  // placement is correct (stacks on the early/naming bonuses). Independent of
  // whether they ultimately keep the card (pro/expert may still lose it to a
  // stealer without naming) — the reward is for reading the year correctly.
  const placementTokens = g.public.settings.placementTokens ?? DEFAULT_SETTINGS.placementTokens;
  if (placementCorrect && placementTokens > 0) {
    const gained = Math.min(g.public.settings.maxTokens - active.tokens, placementTokens);
    if (gained > 0) active.tokens += gained;
    tokenAwards.push({
      userId: active.userId,
      namedTitle: false,
      namedArtist: false,
      tokensGained: gained,
      reason: "正解配置",
    });
  }

  // In Pro/Expert the active player must also name the song to KEEP the card.
  const namingOk = mode === "original" ? true : namedBoth;
  const activeKeeps = placementCorrect && namingOk;

  // Evaluate steals in submission order (each judged on the stealer's timeline).
  const steals = g.public.steals
    .slice()
    .sort((a, b) => a.at - b.at)
    .map((s) => {
      const sp = getPlayer(g.public, s.userId);
      return {
        userId: s.userId,
        slotIndex: s.slotIndex,
        correct: isPlacementCorrect(sp.timeline, s.slotIndex, song.year),
      };
    });

  // Award the card: active keeps if correct; else the first correct stealer.
  let awardedTo: string | null = null;
  const card = materialize(songId, songs);
  if (activeKeeps) {
    awardedTo = active.userId;
    active.timeline = sortTimeline([...active.timeline, card]);
  } else {
    const winner = steals.find((s) => s.correct);
    if (winner) {
      awardedTo = winner.userId;
      const wp = getPlayer(g.public, winner.userId);
      wp.timeline = sortTimeline([...wp.timeline, clone(card)]);
    }
  }

  let reason: string | undefined;
  if (placementSlot === null) reason = "時間切れ";
  else if (placementCorrect && !namingOk) reason = "配置は正解でしたが曲名/アーティスト不正解";

  g.public.reveal = {
    songId,
    title: song.title,
    artist: song.artist,
    year: song.year,
    youtubeId: g.public.current?.youtubeId ?? null,
    // Carry playback provider/ids + cover flavor so reveal can play in full
    // (current is cleared just below). Never adds an answer beyond what reveal
    // already exposes.
    ...(g.public.current?.provider === "bilibili"
      ? {
          provider: "bilibili" as const,
          bvid: g.public.current?.bvid,
          isCover: g.public.current?.isCover,
          coverArtist: song.coverArtist,
        }
      : {}),
    placementSlot,
    activeCorrect: activeKeeps,
    placementCorrect,
    awardedTo,
    earlyBonus: g.public.earlyBonusAwarded ?? false,
    extendUsed: g.public.listeningExtended ?? false,
    steals,
    tokenAwards,
    ...(animeQuiz ? { animeQuiz } : {}),
    reason,
  };
  g.public.current = undefined;
  g.public.phase = "reveal";
  g.public.deadline = now + g.public.settings.revealSeconds * 1000;

  if (awardedTo) checkWin(g, awardedTo);
}

function endGame(g: FullGame): void {
  // Deck exhausted: winner is most cards, then most tokens, then lowest seat.
  const ranked = [...g.public.players].sort(
    (a, b) =>
      b.timeline.length - a.timeline.length || b.tokens - a.tokens || a.seat - b.seat,
  );
  g.public.winnerId = ranked[0]?.userId ?? null;
  g.public.phase = "gameover";
  g.public.current = undefined;
  g.public.deadline = undefined;
}

function nextTurn(g: FullGame, songs: Song[], now: number): void {
  const n = g.public.order.length;
  // Advance to the next CONNECTED player, skipping anyone who has dropped so
  // disconnected players don't inject mandatory empty turns each lap.
  for (let step = 1; step <= n; step++) {
    const idx = (g.public.activeIndex + step) % n;
    const uid = g.public.order[idx];
    const p = g.public.players.find((x) => x.userId === uid);
    if (p && p.connected) {
      g.public.activeIndex = idx;
      g.public.round += 1;
      beginTurn(g, songs, now);
      return;
    }
  }
  // Nobody is connected — end the game (winner by current standings).
  endGame(g);
}

/**
 * Auto-advance whatever phase is currently timed out. Idempotent: returns the
 * input unchanged (no version bump) if nothing is due, so multiple clients can
 * call it safely.
 */
export function advance(game: FullGame, songs: Song[], now: number): FullGame {
  // Let NPCs act first (deterministic + idempotent). If a bot moved, return it.
  const stepped = stepBots(game, songs, now);
  if (stepped.public.version !== game.public.version) return stepped;

  const g = clone(game);
  const dl = g.public.deadline ?? Infinity;

  if (g.public.phase === "placing") {
    // A bot's turn is owned by stepBots — never auto-mark/time-out here.
    if (isBot(activePlayer(g.public))) return game;
    const start = g.public.listenStartedAt ?? g.public.current?.startedAt ?? now;
    const dur = g.public.listenDurationMs ?? listenMs(g.public.settings);
    // Placement deadline passed with no submission → discard, resolve. (Checked
    // first so a single advance call always resolves a timed-out turn.)
    if (now >= dl) {
      g.public.listeningEndedAt = g.public.listeningEndedAt ?? now;
      g.public.placement = undefined;
      resolve(g, songs, now);
      g.public.version++;
      return g;
    }
    // Listening window ended (but still within the placement window) → stop the
    // music by marking it, without resolving.
    if (g.public.listeningEndedAt == null && now >= start + dur) {
      g.public.listeningEndedAt = now;
      g.public.version++;
      return g;
    }
    return game;
  }
  if (g.public.phase === "stealing" && now >= dl) {
    resolve(g, songs, now);
    g.public.version++;
    return g;
  }
  if (g.public.phase === "reveal" && now >= dl) {
    if (g.public.winnerId) {
      g.public.phase = "gameover";
      g.public.deadline = undefined;
    } else {
      nextTurn(g, songs, now);
    }
    g.public.version++;
    return g;
  }
  return game; // nothing due
}

/**
 * Manually advance PAST the reveal (the "▶ 次の曲へ" skip). The reveal now lets
 * the song play in full (long auto-advance), so any member can skip ahead when
 * everyone's ready. Idempotent: no-op if not in the reveal phase.
 */
export function advanceReveal(game: FullGame, songs: Song[], now: number): FullGame {
  if (game.public.phase !== "reveal") return game;
  const g = clone(game);
  if (g.public.winnerId) {
    g.public.phase = "gameover";
    g.public.deadline = undefined;
  } else {
    nextTurn(g, songs, now);
  }
  g.public.version++;
  return g;
}

/**
 * Answer the OPTIONAL "このアニメは？" bonus quiz at reveal. 100% optional and
 * side-channel: never gates advanceReveal/advance, never touches placement/
 * steal scoring or the win condition — only tokens. Awards
 * ANIME_QUIZ_BONUS_TOKENS (capped at maxTokens) to the FIRST correct guesser;
 * later guesses (right or wrong) are recorded for the UI but earn nothing more
 * (mirrors stealCard's "first correct wins" pattern). No-op (idempotent, no
 * version bump) when there's no active quiz for this reveal or this player
 * already answered — safe for a racing/late client.
 * ANTI-CHEAT: the correct answer is re-derived here from `songs` (server-only
 * deck data) — never trusted from the client's `choice`, and not read back
 * from the public `reveal.animeQuiz.correct` field either.
 */
export function answerAnimeQuiz(
  game: FullGame,
  userId: string,
  choice: string,
  songs: Song[],
): FullGame {
  const quiz = game.public.reveal?.animeQuiz;
  if (game.public.phase !== "reveal" || !quiz) return game;
  if (!game.public.players.some((p) => p.userId === userId)) {
    throw new GameError("この部屋のメンバーではありません");
  }
  if (quiz.answers[userId] !== undefined) return game; // one guess per player
  if (!quiz.choices.includes(choice)) throw new GameError("不正な選択肢です");

  const g = clone(game);
  const q = g.public.reveal!.animeQuiz!;
  q.answers[userId] = choice;

  const song = songs[g.public.reveal!.songId];
  const correctName = franchiseForCategories(song?.categories);
  if (correctName && choice === correctName && q.solvedBy == null) {
    q.solvedBy = userId;
    const p = getPlayer(g.public, userId);
    p.tokens = Math.min(g.public.settings.maxTokens, p.tokens + ANIME_QUIZ_BONUS_TOKENS);
  }
  g.public.version++;
  return g;
}

// ─── Sanity helpers for the server ────────────────────────────────────────--

/** Does the current state need a playable id resolved for its mystery card?
 *  YouTube cards need a youtubeId; bilibili cards need a bvid. */
export function needsTrackResolution(g: FullGame): boolean {
  const cur = g.public.current;
  if ((g.public.phase !== "placing" && g.public.phase !== "stealing") || !cur) {
    return false;
  }
  // Absent provider = "youtube" (backward-compatible default).
  return cur.provider === "bilibili" ? !cur.bvid : !cur.youtubeId;
}

/** The songId of the card currently being played (server-side use only). */
export function currentSongId(g: FullGame): number | undefined {
  return g.secret.currentSongId;
}

/** Like currentSongId but corrected for a deck.json redeploy that shifted array
 *  indices (uses the card's captured deckKey). Prefer this wherever the id is
 *  used to read the SONG from the current deck (playback resolution, answers). */
export function resolvedCurrentSongId(g: FullGame, songs: Song[]): number | undefined {
  return currentResolvedSongId(g, songs);
}

// ─── NPC (bot) logic ────────────────────────────────────────────────────────
// Pure & deterministic: RNG is seeded from (code, round, seat, purpose) so a
// mutateByCode CAS retry re-derives the SAME decision. Bots run only here,
// server-side; their difficulty never enters public state.

export function hash32(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function botRng(state: PublicState, seat: number, purpose: string): () => number {
  return mulberry32(hash32(`${state.code}|${state.round}|${seat}|${purpose}`));
}

function botProfile(g: FullGame, botId: string): BotProfile {
  const diff = g.secret.bots?.[botId]?.difficulty ?? "normal";
  return BOT_PROFILES[diff];
}

export function botPlaceDecision(
  timeline: TimelineCard[],
  year: number,
  profile: BotProfile,
  rng: () => number,
): number {
  const correct = correctSlot(timeline, year);
  if (rng() < profile.placeCorrectP) return correct;
  // Deliberately wrong: prefer a neighboring incorrect slot.
  const n = timeline.length;
  const candidates = [correct - 1, correct + 1].filter(
    (s) => s >= 0 && s <= n && !isPlacementCorrect(timeline, s, year),
  );
  if (candidates.length > 0) return candidates[Math.floor(rng() * candidates.length)];
  for (let s = 0; s <= n; s++) if (!isPlacementCorrect(timeline, s, year)) return s;
  return correct; // every slot correct (degenerate) → just be right
}

export function botStealDecision(
  timeline: TimelineCard[],
  year: number,
  profile: BotProfile,
  rng: () => number,
  tokens: number,
): { slotIndex: number } | "pass" {
  if (tokens <= 0) return "pass";
  let correct = -1;
  for (let s = 0; s <= timeline.length; s++) {
    if (isPlacementCorrect(timeline, s, year)) {
      correct = s;
      break;
    }
  }
  if (correct < 0) return "pass"; // no correct spot on its own timeline
  return rng() < profile.stealAttemptP ? { slotIndex: correct } : "pass";
}

function thinkMs(profile: BotProfile, rng: () => number): number {
  return profile.thinkMsMin + rng() * (profile.thinkMsMax - profile.thinkMsMin);
}

/**
 * Drive NPC actions. Pure & idempotent: returns the INPUT unchanged (no version
 * bump) unless a bot actually acted, so any client/cron may call it safely and
 * repeatedly. Applies at most ONE bot action per call.
 */
export function stepBots(game: FullGame, songs: Song[], now: number): FullGame {
  const phase = game.public.phase;
  if (phase !== "placing" && phase !== "stealing" && phase !== "reveal") return game;

  // No connected human → end the game (terminates abandoned / bots-only rooms).
  const hasHuman = game.public.players.some((p) => p.connected && !isBot(p));
  if (!hasHuman) {
    const g = clone(game);
    endGame(g);
    g.public.version++;
    return g;
  }

  const songId = currentResolvedSongId(game, songs);
  if (songId === undefined) return game;
  const year = songs[songId].year;

  if (phase === "placing") {
    const active = activePlayer(game.public);
    if (!isBot(active)) return game;
    const profile = botProfile(game, active.userId);
    // Bots place AFTER the listening window ends (so humans hear the full song),
    // then think, clamped to safely before the placement deadline.
    const start = game.public.listenStartedAt ?? game.public.current?.startedAt ?? now;
    const dur = game.public.listenDurationMs ?? listenMs(game.public.settings);
    const listenEnd = start + dur;
    const dl = game.public.deadline ?? Infinity;
    const SAFETY = 1500;
    const botActAt = Math.min(
      listenEnd + thinkMs(profile, botRng(game.public, active.seat, "think")),
      dl - SAFETY,
    );
    if (now < botActAt) return game;
    const slot = botPlaceDecision(active.timeline, year, profile, botRng(game.public, active.seat, "place"));
    return placeCard(game, active.userId, slot, undefined, songs, now);
  }

  if (phase === "stealing") {
    const openedAt = game.public.stealOpenedAt ?? game.public.current?.startedAt ?? now;
    const decisions = game.public.stealerDecisions ?? {};
    const eligibleBots = eligibleStealers(game.public).filter(isBot);
    for (const bot of eligibleBots) {
      if (decisions[bot.userId]) continue; // already decided
      const profile = botProfile(game, bot.userId);
      if (now < openedAt + thinkMs(profile, botRng(game.public, bot.seat, "stealthink"))) continue;
      const decision = botStealDecision(
        bot.timeline,
        year,
        profile,
        botRng(game.public, bot.seat, "steal"),
        bot.tokens,
      );
      // Register a decision either way so the steal phase can end early.
      if (decision === "pass") return passSteal(game, bot.userId, songs, now);
      return stealCard(game, bot.userId, decision.slotIndex, songs, now);
    }
    return game;
  }

  return game; // reveal → advance/nextTurn handles progression
}
