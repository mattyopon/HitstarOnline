import { json, mapError, readBody, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/friends/invite/dismiss { id } — recipient discards an invite. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await readBody(req);
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return json({ error: "invalid id" }, 400);
  try {
    const admin = createAdminClient();
    // Scoped delete: only rows addressed to the caller can be dismissed.
    const { error } = await admin.from("room_invites").delete().eq("id", id).eq("to_user", user.id);
    if (error) throw error;
    return json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
