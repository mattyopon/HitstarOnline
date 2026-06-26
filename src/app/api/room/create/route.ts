import { json, mapError, readBody, requireUser, sanitizeSettings, seedFrom } from "@/lib/api";
import { createRoom } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await readBody(req);
  try {
    const { code } = await createRoom(seedFrom(user, body.name), sanitizeSettings(body.settings));
    return json({ code });
  } catch (e) {
    return mapError(e);
  }
}
