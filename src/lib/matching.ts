// Fuzzy matching for optional title/artist guesses (token bonuses).
// Pure, dependency-free. Generous but not trivially gameable.

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\(.*?\)|\[.*?\]/g, " ") // drop bracketed qualifiers
    .replace(/\bfeat\.?\b.*$/i, " ") // drop "feat. ..."
    .replace(/\bft\.?\b.*$/i, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9぀-ヿ一-龯ｦ-ﾝ ]/g, " ") // keep latin, kana, kanji
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * Returns true if `guess` is "close enough" to `actual`. Exact normalized
 * match, containment, or a small edit distance relative to length all count.
 */
export function looseMatch(guess: string | undefined | null, actual: string): boolean {
  if (!guess) return false;
  const g = normalize(guess);
  const a = normalize(actual);
  if (!g || !a) return false;
  if (g === a) return true;
  // containment (e.g. guessing "billie jean" for "Billie Jean")
  if (a.includes(g) && g.length >= Math.max(4, a.length * 0.6)) return true;
  if (g.includes(a) && a.length >= 4) return true;
  const dist = levenshtein(g, a);
  const tolerance = Math.floor(Math.max(g.length, a.length) * 0.2);
  return dist <= Math.max(1, tolerance);
}
