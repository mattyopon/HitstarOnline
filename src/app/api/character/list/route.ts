import { json, mapError, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CharacterListResponse, PlayerCharacter, PlayerGems, PlayerParty } from "@/lib/gachaTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/character/list → { gems, characters, party }
 * One-shot payload of the caller's gacha resources/roster/party. Reads go
 * through the service role (same pattern as /api/stats) since player_gems
 * etc. have no client SELECT-beyond-own policy gaps to worry about, but this
 * keeps the read path consistent with the write paths (all via admin client).
 */
export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;

  try {
    const admin = createAdminClient();

    const [{ data: gemsRow, error: gemsErr }, { data: charRows, error: charErr }, { data: partyRows, error: partyErr }] =
      await Promise.all([
        admin
          .from("player_gems")
          .select("gems, notes, tokens, pity_count, daily_pull_at")
          .eq("user_id", user.id)
          .maybeSingle(),
        admin
          .from("player_characters")
          .select("character_id, level, dupes, acquired_at")
          .eq("user_id", user.id),
        admin.from("player_party").select("slot, character_id").eq("user_id", user.id),
      ]);
    if (gemsErr) throw gemsErr;
    if (charErr) throw charErr;
    if (partyErr) throw partyErr;

    const gems: PlayerGems = gemsRow
      ? {
          gems: gemsRow.gems,
          notes: gemsRow.notes,
          tokens: gemsRow.tokens,
          pityCount: gemsRow.pity_count,
          dailyPullAt: gemsRow.daily_pull_at,
        }
      : { gems: 0, notes: 0, tokens: 0, pityCount: 0, dailyPullAt: null };

    const characters: PlayerCharacter[] = (charRows ?? []).map((r) => ({
      characterId: r.character_id,
      level: r.level,
      dupes: r.dupes,
      acquiredAt: r.acquired_at,
    }));

    const party: PlayerParty = [null, null, null, null, null];
    for (const row of partyRows ?? []) {
      if (row.slot >= 0 && row.slot <= 4) party[row.slot] = row.character_id;
    }

    const payload: CharacterListResponse = { gems, characters, party };
    return json(payload);
  } catch (e) {
    return mapError(e);
  }
}
