// Lightweight server-time endpoint for client clock synchronization. Game
// timing (listening window, deadlines, early-bonus) is judged against server
// wall-clock values, so each client estimates its offset from this endpoint and
// applies it to every local time comparison. Without it, a device whose clock
// runs fast crosses the listening deadline early and the song never plays for
// that device only — the "one player can't hear the song" bug in 3+ player games.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(JSON.stringify({ now: Date.now() }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });
}
