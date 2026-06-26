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
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
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
    try {
      const j = await res.json();
      detail = j?.error?.message || "";
    } catch {
      /* ignore */
    }
    throw new YouTubeError(res.status, detail || `YouTube API error ${res.status}`);
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

export type FavoriteResult = "added" | "no-token" | "scope" | "error";

export async function addToFavorites(
  token: string | null,
  videoId: string,
): Promise<FavoriteResult> {
  if (!token) return "no-token";
  try {
    let playlistId = await ensurePlaylist(token);
    try {
      await insertItem(token, playlistId, videoId);
    } catch (e) {
      // Playlist was deleted out from under the cache — recreate once.
      if (e instanceof YouTubeError && e.status === 404) {
        try {
          localStorage.removeItem(LS_KEY);
        } catch {
          /* ignore */
        }
        playlistId = await ensurePlaylist(token);
        await insertItem(token, playlistId, videoId);
      } else {
        throw e;
      }
    }
    return "added";
  } catch (e) {
    if (e instanceof YouTubeError && (e.status === 401 || e.status === 403)) {
      return "scope";
    }
    return "error";
  }
}
