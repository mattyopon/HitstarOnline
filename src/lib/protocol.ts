// ───────────────────────────────────────────────────────────────────────────
// Shared game protocol: types for the public (client-visible) and secret
// (server-only) game state, plus settings. The engine in engine.ts operates on
// a FullGame = { public, secret }. Only `public` is ever sent to clients.
// ───────────────────────────────────────────────────────────────────────────

import type { Tier } from "./rank";

export type Phase = "lobby" | "voting" | "placing" | "stealing" | "reveal" | "gameover";

/** Playback provider for a mystery card. Absent provider = "youtube" (the
 *  15,431 existing deck songs are all implicitly YouTube). */
export type Provider = "youtube" | "bilibili";

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
  /** Playback provider; absent = "youtube" (backward-compatible default). */
  provider?: Provider;
  /** Bilibili video id (BV…), set only for bilibili cards. Resolved server-side
   *  like youtubeId. NEVER carries the answer. */
  bvid?: string;
  /** True when this is a cover (歌ってみた): guess the ORIGINAL song's year.
   *  A non-answer flavor hint only — the original's year/title/artist stay
   *  server-side until reveal. */
  isCover?: boolean;
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
  /** Playback provider for the revealed card; absent = "youtube". Lets the
   *  reveal play the full clip with the right player after `current` is cleared. */
  provider?: Provider;
  /** Bilibili video id (BV…) for a bilibili card, so reveal can play it in full. */
  bvid?: string;
  /** True for a cover (歌ってみた) card. */
  isCover?: boolean;
  /** The cover singer (歌い手) — flavor shown ONLY at reveal. */
  coverArtist?: string;
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
  /** Playback provider; absent = YouTube (all 15,431 existing songs). Only
   *  "bilibili" is set explicitly for the cover/歌ってみた cards. */
  provider?: "bilibili";
  /** Bilibili video id (BV…), baked into the deck for bilibili cards (no network
   *  resolution — egress is blocked). */
  bvid?: string;
  /** The cover singer (歌い手). Flavor shown ONLY at reveal — the year/title/
   *  artist answer is always the ORIGINAL song's. */
  coverArtist?: string;
  /** True for cover (歌ってみた) cards: guess the ORIGINAL song's release year. */
  isCover?: boolean;
}

export interface CategoryDef {
  id: string;
  labelJa: string;
  labelEn: string;
}

/** Selectable song categories (shared by client + server).
 *  27 karaoke-menu buckets, in desired menu order. */
export const CATEGORIES: CategoryDef[] = [
  { id: "jpop", labelJa: "J-POP", labelEn: "J-POP" },
  { id: "jidol", labelJa: "アイドル", labelEn: "Idol" },
  { id: "jrock", labelJa: "J-ROCK", labelEn: "J-Rock" },
  { id: "enka", labelJa: "演歌・歌謡曲", labelEn: "Enka & Kayokyoku" },
  { id: "vocaloid", labelJa: "ボカロ", labelEn: "Vocaloid" },
  { id: "jp-anime", labelJa: "アニメ", labelEn: "Anime" },
  { id: "tokusatsu", labelJa: "特撮", labelEn: "Tokusatsu" },
  { id: "jrap", labelJa: "邦楽ラップ", labelEn: "J-Rap" },
  { id: "game-music", labelJa: "ゲームミュージック", labelEn: "Game Music" },
  { id: "cnpop", labelJa: "華語ポップス", labelEn: "Mandopop & Cantopop" },
  { id: "us-cartoon", labelJa: "アニメ・キッズ(海外)", labelEn: "Cartoons & Kids (Intl.)" },
  { id: "movie-themes", labelJa: "映画・ドラマ主題歌", labelEn: "Movie & Drama Themes" },
  { id: "christmas", labelJa: "クリスマス", labelEn: "Christmas" },
  { id: "classical", labelJa: "クラシック", labelEn: "Classical" },
  { id: "jazz", labelJa: "ジャズ・ブルース", labelEn: "Jazz & Blues" },
  { id: "bossa", labelJa: "ボサノヴァ", labelEn: "Bossa Nova" },
  { id: "kpop", labelJa: "K-POP", labelEn: "K-POP" },
  { id: "uspop", labelJa: "洋楽POPS", labelEn: "Western Pop" },
  { id: "rock", labelJa: "洋楽ROCK", labelEn: "Western Rock" },
  { id: "edm", labelJa: "洋楽ダンス", labelEn: "Dance & EDM" },
  { id: "hiphop", labelJa: "洋楽ヒップホップ", labelEn: "Hip-Hop" },
  { id: "rnb", labelJa: "洋楽R&B・ソウル", labelEn: "R&B & Soul" },
  { id: "latin", labelJa: "ラテン", labelEn: "Latin" },
  { id: "country", labelJa: "カントリー", labelEn: "Country" },
  { id: "reggae", labelJa: "レゲエ", labelEn: "Reggae" },
  { id: "bollywood", labelJa: "ボリウッド", labelEn: "Bollywood" },
  { id: "karaoke", labelJa: "カラオケ定番", labelEn: "Karaoke Hits" },
];

export const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

// ───────────────────────────────────────────────────────────────────────────
// Theme packs ("縛り") — a SEPARATE axis from the 27 genre CATEGORIES above.
// A pack is a curated subset of the SAME deck songs, tagged with a "pack:<slug>"
// entry in their categories[] array. Packs piggyback on GameSettings.categories
// (no new settings field): selecting a pack id constrains the deck to that pack.
// CATEGORIES is never touched — packs live only in the PACKS registry below.
// ───────────────────────────────────────────────────────────────────────────

/** Tag/id prefix that distinguishes a theme pack from a genre category. */
export const PACK_PREFIX = "pack:";

/** True iff `id` is a theme-pack id (vs. one of the 27 genre categories). */
export function isPackId(id: string): boolean {
  return id.startsWith(PACK_PREFIX);
}

/** Kind of pack — drives grouping/labeling in the picker UI. */
export type PackKind = "franchise" | "artist" | "anime-op";

export interface PackDef {
  /** MUST start with PACK_PREFIX ("pack:"). */
  id: string;
  labelJa: string;
  labelEn: string;
  kind: PackKind;
  /** Optional Vinyl Lounge accent token (hex) for the pack chip/badge. */
  accent?: string;
}

/**
 * Registered theme packs. Each id MUST start with "pack:" and MUST NOT collide
 * with any CATEGORIES id. Only packs with enough tagged songs in the deck
 * (>= players + MIN_DECK_MARGIN; we register at the 12-song playable threshold)
 * are listed here so a normal game always has a workable deck.
 */
export const PACKS: PackDef[] = [
  // ── Theme / franchise-style packs ──────────────────────────────────────────
  { id: "pack:anime-op", labelJa: "人気アニメOP", labelEn: "Popular Anime Openings", kind: "anime-op", accent: "#c44a3a" },
  { id: "pack:superstar", labelJa: "超人気アーティスト", labelEn: "Superstars", kind: "artist", accent: "#d4a330" },
  // ── Single-artist 縛り packs (>= 12 tagged songs in the deck) ───────────────
  { id: "pack:bz", labelJa: "B'z縛り", labelEn: "B'z", kind: "artist", accent: "#a87830" },
  { id: "pack:lisa", labelJa: "LiSA縛り", labelEn: "LiSA", kind: "artist", accent: "#c44a3a" },
  { id: "pack:bump", labelJa: "BUMP OF CHICKEN縛り", labelEn: "BUMP OF CHICKEN", kind: "artist", accent: "#3a6b4a" },
  { id: "pack:yonezu", labelJa: "米津玄師縛り", labelEn: "Kenshi Yonezu", kind: "artist", accent: "#6b6a3a" },
  { id: "pack:utada", labelJa: "宇多田ヒカル縛り", labelEn: "Hikaru Utada", kind: "artist", accent: "#a87830" },
  { id: "pack:mrchildren", labelJa: "Mr.Children縛り", labelEn: "Mr.Children", kind: "artist", accent: "#c44a3a" },
  { id: "pack:oneokrock", labelJa: "ONE OK ROCK縛り", labelEn: "ONE OK ROCK", kind: "artist", accent: "#3d2e1a" },
  { id: "pack:southern", labelJa: "サザンオールスターズ縛り", labelEn: "Southern All Stars", kind: "artist", accent: "#3a6b4a" },
  { id: "pack:mrsgreenapple", labelJa: "Mrs. GREEN APPLE縛り", labelEn: "Mrs. GREEN APPLE", kind: "artist", accent: "#6b6a3a" },
  { id: "pack:yoasobi", labelJa: "YOASOBI縛り", labelEn: "YOASOBI", kind: "artist", accent: "#d4a330" },
  { id: "pack:higedan", labelJa: "Official髭男dism縛り", labelEn: "Official HIGE DANdism", kind: "artist", accent: "#a87830" },
  { id: "pack:xjapan", labelJa: "X JAPAN縛り", labelEn: "X JAPAN", kind: "artist", accent: "#3d2e1a" },
  { id: "pack:arashi", labelJa: "嵐縛り", labelEn: "Arashi", kind: "artist", accent: "#c44a3a" },
  // ── Anime franchise packs (>= 12 unique year-verified songs in the deck) ─────
  { id: "pack:onepiece", labelJa: "ONE PIECE縛り", labelEn: "One Piece", kind: "franchise", accent: "#c44a3a" },
  { id: "pack:conan", labelJa: "名探偵コナン縛り", labelEn: "Detective Conan", kind: "franchise", accent: "#3d2e1a" },
  { id: "pack:naruto", labelJa: "NARUTO縛り", labelEn: "Naruto", kind: "franchise", accent: "#d4a330" },
  { id: "pack:gundam", labelJa: "ガンダム縛り", labelEn: "Gundam", kind: "franchise", accent: "#3a6b4a" },
  { id: "pack:pokemon", labelJa: "ポケモン縛り", labelEn: "Pokémon", kind: "franchise", accent: "#d4a330" },
  { id: "pack:dragonball", labelJa: "ドラゴンボール縛り", labelEn: "Dragon Ball", kind: "franchise", accent: "#a87830" },
  { id: "pack:kimetsu", labelJa: "鬼滅の刃縛り", labelEn: "Demon Slayer", kind: "franchise", accent: "#6b6a3a" },
  // ── Bilibili quiz trio (Bilibili playback) ──────────────────────────────────
  // Hear a Bilibili cover, guess the ORIGINAL song's release year. Cards are
  // provider:"bilibili" + isCover and tagged ONLY "pack:utattemita" (never a genre).
  // Trio plan: 配信者ヒット (VUP covers) / ビリビリヒット (site-legendary songs) /
  // 日本ヒット (pack:jp-hits, registered once >=12 songs land).
  { id: "pack:utattemita", labelJa: "ビリビリ配信者ヒットソングクイズ", labelEn: "Bilibili Streamer Hits Quiz", kind: "anime-op", accent: "#4a7fb5" },
  // B站の镇站神曲・伝説曲そのもの（カバーではない）。provider:"bilibili" + bvid、
  // 中国曲は country:"cn"。回答年はその曲自体の発表年。
  { id: "pack:bili-hits", labelJa: "ビリビリヒットソングクイズ", labelEn: "Bilibili Hit Songs Quiz", kind: "anime-op", accent: "#23ade5" },
];

export const PACK_IDS = new Set(PACKS.map((p) => p.id));
