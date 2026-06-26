// ───────────────────────────────────────────────────────────────────────────
// Shared game protocol: types for the public (client-visible) and secret
// (server-only) game state, plus settings. The engine in engine.ts operates on
// a FullGame = { public, secret }. Only `public` is ever sent to clients.
// ───────────────────────────────────────────────────────────────────────────

export type Phase = "lobby" | "placing" | "stealing" | "reveal" | "gameover";

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
    placeSeconds: 75,
    stealSeconds: 20,
    revealSeconds: 12,
    allowSkip: true,
    buyCost: 3,
    startSeconds: 0,
  };
}

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
  reveal?: RevealInfo;
  winnerId?: string | null;
  /** Number of cards remaining in the deck (for UI). */
  deckRemaining: number;
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
];

export const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));
