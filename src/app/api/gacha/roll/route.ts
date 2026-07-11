import { json, mapError, readBody, requireUser } from "@/lib/api";
import { rollPaid } from "@/lib/gacha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/gacha/roll → { results: [{characterId, rarity, isNew}], gemsRemaining }
 * Body: { count: 1 | 10, banner?: string }
 * Server-authoritative: gem cost is fixed server-side (never trusts a
 * client-submitted balance/cost), debited atomically, then rolled. See
 * src/lib/gacha.ts for the atomicity guarantee.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const body = await readBody(req);
  const count = body.count === 10 ? 10 : body.count === 1 ? 1 : null;
  if (count === null) {
    return json({ error: "countは1か10を指定してください" }, 400);
  }
  const banner = typeof body.banner === "string" ? body.banner : undefined;

  try {
    const outcome = await rollPaid(user.id, count, banner);
    return json(outcome);
  } catch (e) {
    return mapError(e);
  }
}
