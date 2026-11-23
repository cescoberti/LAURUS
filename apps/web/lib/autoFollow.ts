import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Put the star on every file of the committees a member asked to follow
 * automatically (Settings → "Automatic star"), for the part-sessions still
 * ahead.
 *
 * The star is an ordinary item subscription, so the member can remove it file
 * by file. `auto_follows` is what keeps it removed: one row per (member, file)
 * ever starred by the rule, written whether or not the star was already there.
 * A file with a row is never offered again, so a star taken off stays off, and
 * the committee list can grow without re-starring what was dropped.
 *
 * Idempotent: run it as often as is convenient. Pass `userId` to do one member
 * (the settings save), nothing to do everyone (the alert loop).
 */
export async function applyAutoFollows(userId?: string): Promise<{ starred: number }> {
  const admin = createAdminClient();

  let q = admin.from("users").select("id, whatsapp_phone, wants_whatsapp, auto_follow_committees");
  if (userId) q = q.eq("id", userId);
  const { data: allUsers } = await q;
  const users = (allUsers ?? []).filter((u) => ((u.auto_follow_committees as string[] | null) ?? []).length > 0);
  if (!users.length) return { starred: 0 };

  // The Brussels day, not UTC: a file voted today is still being prepared.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
  const { data: sessions } = await admin.from("sessions").select("id").gte("end_date", today);
  const sessionIds = (sessions ?? []).map((s) => s.id as string);
  if (!sessionIds.length) return { starred: 0 };

  const { data: items } = await admin
    .from("items")
    .select("id, committee, committees, vote_date")
    .in("session_id", sessionIds);
  const open = (items ?? []).filter((i) => !i.vote_date || (i.vote_date as string) >= today);
  if (!open.length) return { starred: 0 };

  const { data: done } = await admin
    .from("auto_follows")
    .select("user_id, item_id")
    .in("user_id", users.map((u) => u.id as string));
  const offered = new Set((done ?? []).map((r) => `${r.user_id}|${r.item_id}`));

  let starred = 0;
  for (const u of users) {
    const rules = new Set((u.auto_follow_committees as string[]).map((c) => c.toUpperCase()));
    const channels = ["email", ...(u.whatsapp_phone && u.wants_whatsapp ? ["whatsapp"] : [])];
    const fresh = open.filter((i) => {
      if (offered.has(`${u.id}|${i.id}`)) return false;
      const cmtes = [i.committee, ...((i.committees as string[] | null) ?? [])].filter(Boolean) as string[];
      return cmtes.some((c) => rules.has(c.toUpperCase()));
    });
    if (!fresh.length) continue;

    // The register first, then the stars: if the second write fails the file is
    // merely not starred, and the member can star it; the other order would
    // re-star it on every run after they took it off.
    const { error: regErr } = await admin.from("auto_follows").upsert(
      fresh.map((i) => ({
        user_id: u.id,
        item_id: i.id,
        committee:
          ([i.committee, ...((i.committees as string[] | null) ?? [])].find((c) => c && rules.has((c as string).toUpperCase())) as string | undefined) ?? "",
      })),
      { onConflict: "user_id,item_id", ignoreDuplicates: true },
    );
    if (regErr) continue;
    const { error: subErr } = await admin.from("subscriptions").upsert(
      fresh.flatMap((i) => channels.map((channel) => ({ user_id: u.id, scope: "item", target_id: i.id, channel }))),
      { onConflict: "user_id,scope,target_id,channel", ignoreDuplicates: true },
    );
    if (!subErr) starred += fresh.length;
  }
  return { starred };
}
