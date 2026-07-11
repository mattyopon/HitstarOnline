import { json, readBody, requireUser } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-instance LRU-ish cache: `${target}\n${text}` -> translated text.
// Bounded so a long-lived serverless instance can't grow unbounded.
const CACHE = new Map<string, string>();
const CACHE_MAX = 2000;

function cacheGet(k: string): string | undefined {
  const v = CACHE.get(k);
  if (v !== undefined) {
    CACHE.delete(k); // refresh recency
    CACHE.set(k, v);
  }
  return v;
}
function cacheSet(k: string, v: string): void {
  CACHE.set(k, v);
  if (CACHE.size > CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
}

const LANG_RE = /^[a-z]{2,3}(-[a-z]{2,8})?$/i;

// Per-user, per-instance rate limit on UNCACHED translation requests so a
// malicious client can't drive up the paid Google Translate quota. A fixed
// window keyed by userId; cache hits below don't count against it.
const RL_WINDOW_MS = 60_000;
const RL_MAX_CALLS = 30; // upstream calls per user per minute (cache misses only)
const RL = new Map<string, { count: number; resetAt: number }>();

function rateLimited(userId: string, now: number): boolean {
  const e = RL.get(userId);
  if (!e || now >= e.resetAt) {
    RL.set(userId, { count: 1, resetAt: now + RL_WINDOW_MS });
    // Opportunistic cleanup so the map can't grow unbounded on a long-lived instance.
    if (RL.size > 5000) for (const [k, v] of RL) if (now >= v.resetAt) RL.delete(k);
    return false;
  }
  if (e.count >= RL_MAX_CALLS) return true;
  e.count++;
  return false;
}

/**
 * Translate up to a handful of short chat strings into the viewer's language.
 * Auth-gated (any signed-in user) and length-capped to keep quota in check.
 * Returns { translations: string[] } aligned to the input order. If the key
 * is missing or the call fails, it degrades gracefully to the originals.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const body = await readBody(req);
  const rawTexts = Array.isArray(body.texts) ? body.texts : [];
  const target = typeof body.target === "string" ? body.target.trim().toLowerCase() : "";

  const texts = rawTexts
    .filter((t): t is string => typeof t === "string")
    .slice(0, 20)
    .map((t) => t.slice(0, 240));

  if (!texts.length) return json({ translations: [] });
  if (!LANG_RE.test(target)) return json({ translations: texts });

  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) return json({ translations: texts }); // graceful no-op when unset

  // Serve cache hits; only request the misses.
  const out: (string | null)[] = texts.map((t) => cacheGet(`${target}\n${t}`) ?? null);
  const missIdx: number[] = [];
  const missTexts: string[] = [];
  out.forEach((v, i) => {
    if (v === null) {
      missIdx.push(i);
      missTexts.push(texts[i]);
    }
  });

  if (missTexts.length) {
    // Only the upstream (paid) calls are rate-limited; cache hits above are free.
    // When limited, degrade to originals for the misses instead of erroring.
    if (rateLimited(user.id, Date.now())) {
      missIdx.forEach((origIdx) => (out[origIdx] = texts[origIdx]));
      return json({ translations: out.map((v, i) => v ?? texts[i]) });
    }
    try {
      const res = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ q: missTexts, target, format: "text" }),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          data?: { translations?: { translatedText?: string }[] };
        };
        const translations = data.data?.translations ?? [];
        missIdx.forEach((origIdx, k) => {
          const translated = translations[k]?.translatedText;
          const value = typeof translated === "string" ? translated : texts[origIdx];
          out[origIdx] = value;
          cacheSet(`${target}\n${texts[origIdx]}`, value);
        });
      } else {
        // Quota/error → fall back to originals for the misses.
        missIdx.forEach((origIdx) => (out[origIdx] = texts[origIdx]));
      }
    } catch {
      missIdx.forEach((origIdx) => (out[origIdx] = texts[origIdx]));
    }
  }

  return json({ translations: out.map((v, i) => v ?? texts[i]) });
}
