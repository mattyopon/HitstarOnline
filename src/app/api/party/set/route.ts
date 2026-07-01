import { json, mapError, readBody, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/party/set → { ok: true }
 * Body: { slot: 0-4, characterId: string | null }
 * Server-authoritative: validates the slot range AND that the caller actually
 * owns characterId (a row in their player_characters) before it can enter
 * player_party — a client can never place a character it hasn't pulled.
 * characterId: null clears the slot.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const body = await readBody(req);
  const slot = Number(body.slot);
  if (!Number.isInteger(slot) || slot < 0 || slot > 4) {
    return json({ error: "スロット番号が不正です" }, 400);
  }
  const characterId = body.characterId;
  if (characterId !== null && typeof characterId !== "string") {
    return json({ error: "characterIdが不正です" }, 400);
  }

  try {
    const admin = createAdminClient();

    if (characterId === null) {
      const { error } = await admin
        .from("player_party")
        .delete()
        .eq("user_id", user.id)
        .eq("slot", slot);
      if (error) throw error;
      return json({ ok: true });
    }

    const { data: owned, error: ownedErr } = await admin
      .from("player_characters")
      .select("character_id")
      .eq("user_id", user.id)
      .eq("character_id", characterId)
      .maybeSingle();
    if (ownedErr) throw ownedErr;
    if (!owned) {
      return json({ error: "所持していないキャラクターです" }, 400);
    }

    const { error } = await admin
      .from("player_party")
      .upsert(
        { user_id: user.id, slot, character_id: characterId },
        { onConflict: "user_id,slot" },
      );
    if (error) throw error;
    return json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
