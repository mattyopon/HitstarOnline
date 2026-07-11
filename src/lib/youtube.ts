// Resolve a song to a playable YouTube video id. Runs SERVER-SIDE only.
//
// Strategy:
//   1. If YOUTUBE_API_KEY is set, use the official Data API v3 (most reliable,
//      and we can require embeddable music results).
//   2. Otherwise scrape the public YouTube search results page and take the
//      first video id.
//
// Results are cached by the caller (see rooms.ts → track_cache) so each song is
// only resolved once. On Vercel these requests run from the serverless function
// (not behind any egress proxy), so plain fetch works.

// Prefer ids that appear inside an actual search-result entry (videoRenderer);
// the first bare "videoId" on the page is often a Shorts shelf, an ad, or a
// non-embeddable promo, which is a major source of "songs that won't play".
const YT_RESULT_RE = /"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})"/;
const YT_ID_RE = /"videoId":"([a-zA-Z0-9_-]{11})"/;

async function viaDataApi(query: string, key: string): Promise<string | null> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("videoEmbeddable", "true");
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("q", query);
  url.searchParams.set("key", key);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    items?: { id?: { videoId?: string } }[];
  };
  return data.items?.[0]?.id?.videoId ?? null;
}

async function viaScrape(query: string): Promise<string | null> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) return null;
  const html = await res.text();
  return html.match(YT_RESULT_RE)?.[1] ?? html.match(YT_ID_RE)?.[1] ?? null;
}

export async function searchYouTubeId(query: string): Promise<string | null> {
  const key = process.env.YOUTUBE_API_KEY;
  try {
    if (key) {
      const viaApi = await viaDataApi(query, key);
      if (viaApi) return viaApi;
    }
    return await viaScrape(query);
  } catch {
    return null;
  }
}
