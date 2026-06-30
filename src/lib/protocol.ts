// ───────────────────────────────────────────────────────────────────────────
// Shared game protocol: types for the public (client-visible) and secret
// (server-only) game state, plus settings. The engine in engine.ts operates on
// a FullGame = { public, secret }. Only `public` is ever sent to clients.
// ───────────────────────────────────────────────────────────────────────────

import type { Tier } from "./rank";

export type Phase = "lobby" | "voting" | "placing" | "stealing" | "reveal" | "gameover";

/** Shared deck-size margin: a deck must hold at least players + this many songs
 *  to start (1 starting card each + a comfortable supply of mystery cards). Used
 *  by the start route, the vote-start fallback, and votable-category eligibility. */
export const MIN_DECK_MARGIN = 6;

/** Seconds the genre majority-vote stays open before the deadline backstop fires. */
export const VOTE_DURATION_SECONDS = 30;

/** Difficulty mode (changes what it takes to keep/steal a card). */
export type GameMode = "original" | "pro" | "expert";

export interface GameSettings {
  mode: GameMode;
  /** Ranked match: results count toward the player's record (uses Expert rules). */
  ranked: boolean;
  /** Song category ids to draw from (empty = all categories). */
  categories: string[];
  /** Earned cards (excluding the starting seed) needed to win. Official = 10. */
  targetCards: number;
  /** Tokens each player starts with. */
  startingTokens: number;
  /** Maximum tokens a player can hold (official cap = 5). */
  maxTokens: number;
  /** Seconds the active player has to place a card. */
  placeSeconds: number;
  /** Seconds opponents have to steal after a placement. */
  stealSeconds: number;
  /** Seconds the reveal is shown before the next turn. */
  revealSeconds: number;
  /** Allow spending a token to skip the current song. */
  allowSkip: boolean;
  /** Cost in tokens to buy/auto-place the current card. */
  buyCost: number;
  /** Where in the YouTube track to start playback (seconds). */
  startSeconds: number;
  /** Seconds the active player listens before the song ends. Official 30. */
  listenSeconds: number;
  /** Seconds to PLACE after the song ends. Official 30. */
  placementSeconds: number;
  /** Allow spending tokens to extend listening (延長). */
  allowExtend: boolean;
  /** Token cost to extend listening once. */
  extendCost: number;
  /** Seconds added to listening per extension. Official 60. */
  extendSeconds: number;
  /** Max extensions per turn. 1 = one-time (official); 0 disables. */
  maxExtendPerTurn: number;
  /** Early-placement bonus window from song START (ms). Official 10000. */
  earlyBonusMs: number;
  /** Tokens awarded for a correct early placement. Official 2. */
  earlyBonusTokens: number;
  /** Tokens awarded to the active player for ANY correct placement (every turn).
   *  Stacks on top of the early/naming bonuses. 0 disables. */
  placementTokens: number;
}

/** Starting tokens per official mode. */
export const MODE_START_TOKENS: Record<GameMode, number> = {
  original: 2,
  pro: 5,
  expert: 3,
};

/** NPC difficulty for solo play. */
export type BotDifficulty = "easy" | "normal" | "hard";

export interface BotProfile {
  /** Probability the bot places the card in a correct slot. */
  placeCorrectP: number;
  /** Probability the bot attempts a steal when it can. */
  stealAttemptP: number;
  /** Min/max "thinking" time before the bot acts (ms). */
  thinkMsMin: number;
  thinkMsMax: number;
}

export const BOT_PROFILES: Record<BotDifficulty, BotProfile> = {
  easy: { placeCorrectP: 0.5, stealAttemptP: 0.15, thinkMsMin: 3000, thinkMsMax: 6000 },
  normal: { placeCorrectP: 0.8, stealAttemptP: 0.45, thinkMsMin: 2500, thinkMsMax: 5000 },
  hard: { placeCorrectP: 0.97, stealAttemptP: 0.85, thinkMsMin: 1500, thinkMsMax: 3500 },
};

export const BOT_NAMES = ["アオイ", "ハル", "ミオ", "ソラ", "リク", "ナギ", "ユウ", "カイ"];

export function defaultSettings(): GameSettings {
  return {
    mode: "original",
    ranked: false,
    categories: [],
    targetCards: 10,
    startingTokens: 2,
    maxTokens: 5,
    placeSeconds: 75, // legacy, superseded by listenSeconds + placementSeconds
    stealSeconds: 10, // steal-decision window
    revealSeconds: 240, // reveal plays the song in full; players skip with ▶ 次の曲へ
    allowSkip: true,
    buyCost: 3,
    startSeconds: 0,
    listenSeconds: 60,
    placementSeconds: 30,
    allowExtend: true,
    extendCost: 1,
    extendSeconds: 60,
    maxExtendPerTurn: 1,
    earlyBonusMs: 10000,
    earlyBonusTokens: 2,
    placementTokens: 1,
  };
}

/** Frozen canonical defaults — the single source for the backward-compat
 *  fallbacks used when reading possibly-old persisted settings
 *  (e.g. `s.listenSeconds ?? DEFAULT_SETTINGS.listenSeconds`). */
export const DEFAULT_SETTINGS: Readonly<GameSettings> = Object.freeze(defaultSettings());

/** A revealed song card sitting on a player's timeline. */
export interface TimelineCard {
  /** Unique instance id for this card placement. */
  id: string;
  songId: number;
  title: string;
  artist: string;
  year: number;
}

export interface PublicPlayer {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  seat: number;
  tokens: number;
  connected: boolean;
  /** NPC flag. Bot difficulty is kept server-side (SecretState), never public. */
  isBot?: boolean;
  /** Always sorted ascending by year. */
  timeline: TimelineCard[];
  /** Ranked tier for display only (undefined for casual/solo/guest/bot).
   *  Opaque to the engine — injected by rooms.ts AFTER the pure engine runs. */
  tier?: Tier;
}

/** What clients need to PLAY the mystery song without learning the answer. */
export interface CurrentTrack {
  cardId: string;
  /** Resolved YouTube video id, or null while resolving / unavailable. */
  youtubeId: string | null;
  startSeconds: number;
  /** Epoch ms when listening started (lets clients sync playback). */
  startedAt: number;
}

export interface StealEntry {
  userId: string;
  slotIndex: number;
  at: number;
}

export interface TokenAward {
  userId: string;
  namedTitle: boolean;
  namedArtist: boolean;
  /** Tokens actually gained (Original mode: 1 only if both names correct). */
  tokensGained: number;
  /** Optional UI label, e.g. "早置きボーナス". Omitted for the naming bonus. */
  reason?: string;
}

export interface StealResult {
  userId: string;
  slotIndex: number;
  correct: boolean;
}

export interface RevealInfo {
  songId: number;
  title: string;
  artist: string;
  year: number;
  youtubeId: string | null;
  /** Active player's placement, or null if they timed out. */
  placementSlot: number | null;
  activeCorrect: boolean;
  /** Who ultimately won the card (active player or a stealer), or null. */
  awardedTo: string | null;
  /** True when the active player bought (auto-placed) the card. */
  bought?: boolean;
  /** True if the active player's placement earned the early-placement bonus. */
  earlyBonus?: boolean;
  /** True if the active player extended their listening this turn. */
  extendUsed?: boolean;
  steals: StealResult[];
  tokenAwards: TokenAward[];
  reason?: string;
}

export interface PublicState {
  version: number;
  phase: Phase;
  code: string;
  hostId: string;
  players: PublicPlayer[];
  /** Seat order of userIds. */
  order: string[];
  activeIndex: number;
  round: number;
  settings: GameSettings;
  current?: CurrentTrack;
  /** Active player's submitted placement (visible during stealing/reveal). */
  placement?: { slotIndex: number };
  guess?: { title?: string; artist?: string };
  steals: StealEntry[];
  /** Epoch ms when the current phase auto-advances. */
  deadline?: number;
  /** Epoch ms when the stealing window opened (used to time bot steals). */
  stealOpenedAt?: number;
  /** Epoch ms when the song started playing (early-bonus cutoff base). */
  listenStartedAt?: number;
  /** Duration of the listening window in ms (30000, or 90000 if extended). */
  listenDurationMs?: number;
  /** True once the active player has extended listening this turn (one-time). */
  listeningExtended?: boolean;
  /** Epoch ms when listening ended; null/undefined = still listening. */
  listeningEndedAt?: number | null;
  /** Epoch ms placement is due (= listen end + placementSeconds). */
  placementDeadline?: number;
  /** True if the active player's placement earned the early bonus. */
  earlyBonusAwarded?: boolean;
  /** Actual early-bonus tokens credited (after the maxTokens cap) — so the
   *  reveal shows the real gain, not the nominal earlyBonusTokens. */
  earlyBonusGained?: number;
  /** Stealers who have decided (steal OR pass) — enables early steal-phase end. */
  stealerDecisions?: Record<string, "steal" | "pass">;
  reveal?: RevealInfo;
  winnerId?: string | null;
  /** Number of cards remaining in the deck (for UI). */
  deckRemaining: number;
  /** Genre majority-vote (phase "voting"): userId -> chosen category ids.
   *  Only present during/while resolving voting; cleared when the game starts. */
  votes?: Record<string, string[]>;
}

export interface SecretState {
  /** Shuffled song indices — the draw order. */
  deck: number[];
  drawPos: number;
  /** songId of the current mystery card (resolved at reveal). */
  currentSongId?: number;
  /** NPC difficulty by bot userId (server-only; never exposed publicly). */
  bots?: Record<string, { difficulty: BotDifficulty }>;
}

export interface FullGame {
  public: PublicState;
  secret: SecretState;
}

export interface PlayerSeed {
  userId: string;
  name: string;
  avatarUrl?: string | null;
}

/** A song entry from the deck dataset. */
export interface Song {
  title: string;
  artist: string;
  year: number;
  region?: string;
  /** Country of origin, e.g. "jp" | "us" | "cn" | "kr" | "intl". */
  country?: string;
  /** Category tags (e.g. ["jp-anime"]); used for category-filtered decks. */
  categories?: string[];
  /** Alternate titles/scripts/romanizations for cross-language matching. */
  aliases?: string[];
  artistAliases?: string[];
}

export interface CategoryDef {
  id: string;
  labelJa: string;
  labelEn: string;
}

/** Selectable song categories (shared by client + server). */
export const CATEGORIES: CategoryDef[] = [
  { id: "karaoke", labelJa: "カラオケ定番", labelEn: "Karaoke Hits" },
  { id: "jpop", labelJa: "J-POP", labelEn: "J-Pop" },
  { id: "jp-anime", labelJa: "アニメ(日)", labelEn: "Anime (JP)" },
  { id: "vocaloid", labelJa: "ボカロ", labelEn: "Vocaloid" },
  { id: "uspop", labelJa: "洋楽ポップ", labelEn: "US Pop" },
  { id: "us-cartoon", labelJa: "アニメ(米)", labelEn: "Cartoon (US)" },
  { id: "disney", labelJa: "ディズニー", labelEn: "Disney" },
  { id: "uk-rock", labelJa: "UKロック", labelEn: "UK Rock" },
  { id: "kpop", labelJa: "K-POP", labelEn: "K-Pop" },
  { id: "cn-anime", labelJa: "アニメ(中)", labelEn: "Anime (CN)" },
  { id: "game-music", labelJa: "ゲーム音楽", labelEn: "Game Music" },
  { id: "movie-themes", labelJa: "映画音楽", labelEn: "Movie Themes" },
  { id: "latin", labelJa: "ラテン", labelEn: "Latin" },
  { id: "famous-in-japan", labelJa: "日本で人気", labelEn: "Famous in Japan" },
  { id: "famous-in-usa", labelJa: "アメリカで人気", labelEn: "Famous in USA" },
  { id: "famous-in-korea", labelJa: "韓国で人気", labelEn: "Famous in Korea" },
  { id: "famous-in-china", labelJa: "中国で人気", labelEn: "Famous in China" },
  // Genre packs (added later — songs span many decades for good placement play).
  { id: "rock", labelJa: "ロック", labelEn: "Rock" },
  { id: "metal", labelJa: "メタル", labelEn: "Metal" },
  { id: "hiphop", labelJa: "ヒップホップ", labelEn: "Hip-Hop" },
  { id: "edm", labelJa: "EDM・ダンス", labelEn: "EDM/Dance" },
  { id: "rnb", labelJa: "R&B・ソウル", labelEn: "R&B/Soul" },
  { id: "country", labelJa: "カントリー", labelEn: "Country" },
  { id: "citypop", labelJa: "シティポップ", labelEn: "City Pop" },
  { id: "jrock", labelJa: "J-ROCK", labelEn: "J-Rock" },
  { id: "reggae", labelJa: "レゲエ", labelEn: "Reggae" },
  { id: "jazz", labelJa: "ジャズ", labelEn: "Jazz" },
  { id: "classical", labelJa: "クラシック", labelEn: "Classical" },
  { id: "christmas", labelJa: "クリスマス", labelEn: "Christmas" },
  { id: "bollywood", labelJa: "ボリウッド", labelEn: "Bollywood" },
  { id: "afrobeats", labelJa: "アフロビーツ", labelEn: "Afrobeats" },
  { id: "tokusatsu", labelJa: "特撮ヒーロー", labelEn: "Tokusatsu" },
  { id: "jidol", labelJa: "アイドル(日)", labelEn: "J-Idol" },
  { id: "jrap", labelJa: "日本語ラップ", labelEn: "J-Hip-Hop" },
  { id: "enka", labelJa: "演歌", labelEn: "Enka" },
  { id: "disco", labelJa: "ディスコ", labelEn: "Disco" },
  { id: "funk", labelJa: "ファンク", labelEn: "Funk" },
  { id: "punk", labelJa: "パンク", labelEn: "Punk" },
  { id: "blues", labelJa: "ブルース", labelEn: "Blues" },
  { id: "bossa", labelJa: "ボサノヴァ", labelEn: "Bossa Nova" },
  { id: "frenchpop", labelJa: "フレンチポップ", labelEn: "French Pop" },
  { id: "house", labelJa: "ハウス", labelEn: "House" },
  { id: "reggaeton", labelJa: "レゲトン", labelEn: "Reggaeton" },
];

export const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));
