import { json, mapError, readBody, requireUser } from "@/lib/api";
import { extendListening } from "@/lib/engine";
import { mutateByCode } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await readBody(req);
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code) return json({ error: "部屋コードがありません" }, 400);

  const now = Date.now();
  try {
    const result = await mutateByCode(code, (g) => extendListening(g, user.id, now));
    return json({ ok: true, state: result.public });
  } catch (e) {
    return mapError(e);
  }
}
