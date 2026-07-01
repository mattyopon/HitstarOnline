import { json, mapError, readBody, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/friends/respond → { ok: true, accepted: boolean }
 * Body: { requestId: string, accept: boolean }
 *
 * accept === true : calls the SECURITY DEFINER accept_friend_request() RPC via
 *   the caller's own session client — the RPC self-scopes to
 *   `to_user = auth.uid()` and atomically flips the request + creates the
 *   canonical friendship edge. Null result → the request isn't a pending one
 *   addressed to the caller (404).
 * accept === false : service-role update to status='declined', guarded by
 *   `to_user = user.id and status = 'pending'` (404 if it affected no rows).
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const body = await readBody(req);
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const accept = body.accept === true;
  if (!requestId) return json({ error: "リクエストが見つかりません" }, 404);

  try {
    if (accept) {
      // Self-scoped RPC — safe to call with the user session client.
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("accept_friend_request", {
        p_request_id: requestId,
      });
      if (error) throw error;
      if (!data) return json({ error: "リクエストが見つかりません" }, 404);
      return json({ ok: true, accepted: true });
    }

    const admin = createAdminClient();
    const { data: updated, error } = await admin
      .from("friend_requests")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("to_user", user.id)
      .eq("status", "pending")
      .select("id");
    if (error) throw error;
    if (!updated || updated.length === 0) {
      return json({ error: "リクエストが見つかりません" }, 404);
    }
    return json({ ok: true, accepted: false });
  } catch (e) {
    return mapError(e);
  }
}
