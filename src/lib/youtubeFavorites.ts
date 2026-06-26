"use client";

// Add a song to the user's own YouTube account, into a "Hitstar お気に入り"
// playlist (created on first use). Uses the Google provider access token from
// the Supabase session (requires the YouTube scope granted at sign-in).
//
// Runs entirely in the browser with the OAuth access token (no API key needed
// for authenticated requests). The playlist id is cached in localStorage.

/* eslint-disable @typescript-eslint/no-explicit-any */

export const FAVORITES_TITLE = "Hitstar お気に入り";
const LS_KEY = "hitstar_fav_playlist_id";

class YouTubeError extends Error {
  status: number;
  reason: string;
  constructor(status: number, message: string, reason = "") {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

async function yt(path: string, token: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = "";
    let reason = "";
    try {
      const j = await res.json();
      detail = j?.error?.message || "";
      reason = j?.error?.errors?.[0]?.reason || j?.error?.status || "";
    } catch {
      /* ignore */
    }
    throw new YouTubeError(res.status, detail || `YouTube API error ${res.status}`, reason);
  }
  return res.json();
}

async function findPlaylist(token: string): Promise<string | null> {
  let pageToken = "";
  for (let i = 0; i < 5; i++) {
    const data = await yt(
      `playlists?part=snippet&mine=true&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ""}`,
      token,
    );
    const found = (data.items || []).find((p: any) => p?.snippet?.title === FAVORITES_TITLE);
    if (found) return found.id;
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return null;
}

async function createPlaylist(token: string): Promise<string> {
  const data = await yt("playlists?part=snippet,status", token, {
    method: "POST",
    body: JSON.stringify({
      snippet: {
        title: FAVORITES_TITLE,
        description: "Hitstar Online で気に入った曲",
      },
      status: { privacyStatus: "private" },
    }),
  });
  return data.id;
}

async function ensurePlaylist(token: string): Promise<string> {
  try {
    const cached = localStorage.getItem(LS_KEY);
    if (cached) return cached;
  } catch {
    /* ignore */
  }
  let id = await findPlaylist(token);
  if (!id) id = await createPlaylist(token);
  try {
    localStorage.setItem(LS_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

async function insertItem(token: string, playlistId: string, videoId: string): Promise<void> {
  await yt("playlistItems?part=snippet", token, {
    method: "POST",
    body: JSON.stringify({
      snippet: {
        playlistId,
        resourceId: { kind: "youtube#video", videoId },
      },
    }),
  });
}

export type FavoriteResult = "added" | "no-token" | "scope" | "quota" | "error";

const QUOTA_RE = /quota|rateLimit|dailyLimit|userRateLimit/i;

function classify(e: unknown): FavoriteResult {
  if (e instanceof YouTubeError) {
    if (QUOTA_RE.test(e.reason)) return "quota";
    if (e.status === 401 || e.status === 403) return "scope";
  }
  return "error";
}

async function tryAdd(token: string): Promise<string> {
  return ensurePlaylist(token);
}

export async function addToFavorites(
  token: string | null,
  videoId: string,
): Promise<FavoriteResult> {
  if (!token) return "no-token";
  try {
    const pid = await tryAdd(token);
    try {
      await insertItem(token, pid, videoId);
      return "added";
    } catch (e) {
      // Cached playlist is gone or belongs to another account (shared device):
      // clear cache and retry once with a freshly resolved/created playlist.
      const retryable =
        e instanceof YouTubeError && (e.status === 404 || e.status === 403) && !QUOTA_RE.test(e.reason);
      if (!retryable) throw e;
      try {
        localStorage.removeItem(LS_KEY);
      } catch {
        /* ignore */
      }
      const pid2 = await ensurePlaylist(token);
      await insertItem(token, pid2, videoId);
      return "added";
    }
  } catch (e) {
    return classify(e);
  }
}
