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
  FullGame,
  GameSettings,
  MODE_START_TOKENS,
  PlayerSeed,
  PublicPlayer,
  PublicState,
  SecretState,
  Song,
  TimelineCard,
  defaultSettings,
} from "./protocol";
import { looseMatch } from "./matching";

export class GameError extends Error {}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

function cardId(songId: number): string {
  return `s${songId}`;
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
  return state.players.filter(
    (p) =>
      p.userId !== activeUid &&
      p.connected &&
      p.tokens > 0 &&
      !already.has(p.userId) &&
      // must have somewhere to place (always true: any timeline has len+1 slots)
      true,
  );
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
  const g = clone(game);
  if (g.public.phase !== "lobby") {
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

export function removePlayer(game: FullGame, userId: string): FullGame {
  const g = clone(game);
  const idx = g.public.players.findIndex((p) => p.userId === userId);
  if (idx === -1) return game;

  if (g.public.phase === "lobby") {
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

/** Begin a turn: draw the mystery card and open the placing phase. */
function beginTurn(g: FullGame, songs: Song[], now: number): void {
  const songId = drawNext(g.secret);
  if (songId === null) {
    endGame(g);
    return;
  }
  g.secret.currentSongId = songId;
  g.public.current = {
    cardId: cardId(songId),
    youtubeId: null,
    startSeconds: g.public.settings.startSeconds,
    startedAt: now,
  };
  g.public.placement = undefined;
  g.public.guess = undefined;
  g.public.steals = [];
  g.public.reveal = undefined;
  g.public.phase = "placing";
  g.public.deadline = now + g.public.settings.placeSeconds * 1000;
  g.public.deckRemaining = g.secret.deck.length - g.secret.drawPos;
}

export function startGame(game: FullGame, deckOrder: number[], songs: Song[], now: number): FullGame {
  const g = clone(game);
  if (g.public.phase !== "lobby") throw new GameError("ゲームは既に開始されています");
  const n = g.public.players.length;
  if (n < 1) throw new GameError("プレイヤーがいません");
  if (deckOrder.length < n + 1) throw new GameError("曲が足りません");

  g.secret.deck = [...deckOrder];
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

  g.public.placement = { slotIndex };
  g.public.guess = guess && (guess.title || guess.artist) ? { ...guess } : undefined;

  // Open stealing if anyone can; otherwise resolve immediately.
  if (eligibleStealers(g.public).length > 0) {
    g.public.phase = "stealing";
    g.public.deadline = now + g.public.settings.stealSeconds * 1000;
    g.public.version++;
    return g;
  }
  resolve(g, songs, now);
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
  const songId = g.secret.currentSongId;
  if (songId === undefined) throw new GameError("購入できる曲がありません");
  const song = songs[songId];

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
    placementSlot: slot,
    activeCorrect: true,
    awardedTo: active.userId,
    bought: true,
    steals: [],
    tokenAwards: [],
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

  // If nobody else can steal, resolve now.
  if (eligibleStealers(g.public).length === 0) {
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

function wonCards(p: PublicPlayer): number {
  // The starting seed card doesn't count toward the target.
  return Math.max(0, p.timeline.length - 1);
}

function checkWin(g: FullGame, userId: string): void {
  const p = getPlayer(g.public, userId);
  if (wonCards(p) >= g.public.settings.targetCards) {
    g.public.winnerId = userId;
  }
}

function resolve(g: FullGame, songs: Song[], now: number): void {
  const songId = g.secret.currentSongId;
  if (songId === undefined) throw new GameError("解決できる曲がありません");
  const song = songs[songId];
  const mode = g.public.settings.mode;
  const active = activePlayer(g.public);
  const placementSlot = g.public.placement?.slotIndex ?? null;
  const placementCorrect =
    placementSlot !== null && isPlacementCorrect(active.timeline, placementSlot, song.year);

  // Optional naming (active player). Original: earns a token if BOTH correct.
  const namedTitle = looseMatch(g.public.guess?.title, song.title);
  const namedArtist = looseMatch(g.public.guess?.artist, song.artist);
  const namedBoth = namedTitle && namedArtist;

  const tokenAwards = [];
  if (g.public.guess && (g.public.guess.title || g.public.guess.artist)) {
    const tokensGained = mode === "original" && namedBoth ? 1 : 0;
    if (tokensGained > 0) {
      active.tokens = Math.min(g.public.settings.maxTokens, active.tokens + tokensGained);
    }
    tokenAwards.push({ userId: active.userId, namedTitle, namedArtist, tokensGained });
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
    placementSlot,
    activeCorrect: activeKeeps,
    awardedTo,
    steals,
    tokenAwards,
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
  g.public.activeIndex = (g.public.activeIndex + 1) % n;
  g.public.round += 1;
  beginTurn(g, songs, now);
}

/**
 * Auto-advance whatever phase is currently timed out. Idempotent: returns the
 * input unchanged (no version bump) if nothing is due, so multiple clients can
 * call it safely.
 */
export function advance(game: FullGame, songs: Song[], now: number): FullGame {
  const g = clone(game);
  const dl = g.public.deadline ?? Infinity;

  if (g.public.phase === "placing" && now >= dl) {
    // Active player timed out — no placement, card discarded.
    g.public.placement = undefined;
    resolve(g, songs, now);
    g.public.version++;
    return g;
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

// ─── Sanity helpers for the server ────────────────────────────────────────--

/** Does the current state need a YouTube id resolved for its mystery card? */
export function needsTrackResolution(g: FullGame): boolean {
  return (
    (g.public.phase === "placing" || g.public.phase === "stealing") &&
    !!g.public.current &&
    !g.public.current.youtubeId
  );
}

/** The songId of the card currently being played (server-side use only). */
export function currentSongId(g: FullGame): number | undefined {
  return g.secret.currentSongId;
}
