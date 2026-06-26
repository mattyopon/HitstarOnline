import { json, requireUser } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

// STUN is always useful for srflx candidates; TURN is what makes it work behind
// symmetric NATs / mobile carriers.
const STUN: IceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

/**
 * Returns the ICE server list for the WebRTC voice mesh. Auth-gated (voice is
 * multiplayer-only, which already requires a Google account). TURN credentials
 * come from env; if a Metered API key is configured we additionally fetch fresh
 * short-lived credentials and merge them in (best-effort).
 */
export async function POST() {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const iceServers: IceServer[] = [...STUN];

  const urls = process.env.NEXT_PUBLIC_TURN_URLS;
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (urls && username && credential) {
    iceServers.push({
      urls: urls.split(",").map((u) => u.trim()).filter(Boolean),
      username,
      credential,
    });
  }

  // Optional: fresh, time-limited TURN creds from Metered Open Relay.
  const meteredKey = process.env.METERED_API_KEY;
  const meteredHost = process.env.METERED_HOST; // e.g. "yoursubdomain.metered.live"
  if (meteredKey && meteredHost) {
    try {
      const res = await fetch(
        `https://${meteredHost}/api/v1/turn/credentials?apiKey=${encodeURIComponent(meteredKey)}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const fresh = (await res.json()) as IceServer[];
        if (Array.isArray(fresh)) iceServers.push(...fresh);
      }
    } catch {
      /* best-effort; static creds above still apply */
    }
  }

  return json({ iceServers });
}
