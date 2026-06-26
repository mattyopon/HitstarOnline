// ───────────────────────────────────────────────────────────────────────────
// Lightweight multilingual profanity masking for chat. Pure & dependency-free
// so it can run on both client (mask before broadcasting) and as a defense in
// depth on receive. This is intentionally a small, conservative list — it aims
// to soften obvious slurs/abuse in a friendly party game, not to be exhaustive.
// ───────────────────────────────────────────────────────────────────────────

// Word-ish patterns for languages that use spaces (matched on word boundaries,
// case-insensitive). Keep entries lowercase.
const WORD_LIST: string[] = [
  // en
  "fuck", "fucker", "fucking", "motherfucker", "shit", "bullshit", "bitch",
  "bastard", "asshole", "dickhead", "cunt", "slut", "whore", "retard",
  "nigger", "faggot", "wanker",
  // es
  "puta", "puto", "mierda", "cabron", "pendejo", "gilipollas", "coño",
  // pt
  "merda", "caralho", "porra", "puta",
  // fr
  "merde", "putain", "connard", "salope", "encule",
  // de
  "scheisse", "arschloch", "fotze",
  // ru (latinized common ones)
  "blyat", "suka", "pizdec",
  // id/ms
  "anjing", "bangsat", "kontol", "memek",
  // tl
  "puta", "gago", "tangina", "putangina",
];

// Substring patterns for CJK / no-space scripts (matched anywhere).
const SUBSTRING_LIST: string[] = [
  // ja
  "死ね", "しね", "殺す", "ころす", "きもい", "キモい", "うざい", "ウザい",
  "ばか", "バカ", "馬鹿", "あほ", "アホ", "くそ", "クソ", "ぶす", "ブス",
  "きちがい", "カス", "ゴミ", "デブ",
  // ko
  "씨발", "시발", "개새끼", "병신", "지랄", "좆", "썅",
  // zh
  "操你", "草你", "傻逼", "煞笔", "婊子", "去死", "废物", "贱",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build once. Word-boundary group handles Latin words; we also catch them as
// substrings with separators (e.g. "f u c k"-style is NOT handled — kept simple).
const WORD_RE = new RegExp(
  `\\b(${WORD_LIST.map(escapeRegExp).join("|")})\\b`,
  "gi",
);
const SUB_RE = new RegExp(`(${SUBSTRING_LIST.map(escapeRegExp).join("|")})`, "g");

function mask(match: string): string {
  // Preserve length so the rhythm of the message is intact.
  return "●".repeat([...match].length);
}

/** Replace profanity with ● while preserving overall length. */
export function cleanText(text: string): string {
  if (!text) return text;
  return text.replace(WORD_RE, mask).replace(SUB_RE, mask);
}

/** True if the text contains masked-out profanity. */
export function hasProfanity(text: string): boolean {
  if (!text) return false;
  WORD_RE.lastIndex = 0;
  SUB_RE.lastIndex = 0;
  return WORD_RE.test(text) || SUB_RE.test(text);
}
