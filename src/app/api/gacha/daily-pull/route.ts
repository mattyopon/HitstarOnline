import { json, mapError, readBody, requireUser } from "@/lib/api";
import { rollDaily } from "@/lib/gacha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/gacha/daily-pull → same shape as /api/gacha/roll's single pull.
 * Body: { banner?: string }
 * 24h-gated free pull; the cooldown check-and-set happens as a single atomic
 * UPDATE (claim_daily_pull RPC) so concurrent requests can't double-claim.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const body = await readBody(req);
  const banner = typeof body.banner === "string" ? body.banner : undefined;

  try {
    const outcome = await rollDaily(user.id, banner);
    return json(outcome);
  } catch (e) {
    return mapError(e);
  }
}
