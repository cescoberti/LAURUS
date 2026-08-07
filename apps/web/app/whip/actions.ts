"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDueReminders } from "@/lib/notify/whipReminder";

/** The whip cruscotto is editable by whips and admins. */
async function requireWhip() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authorized.");
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "whip" && profile?.role !== "admin") throw new Error("Not authorized.");
  return createAdminClient();
}

/**
 * Reassign the advisor for one committee of a file. Empty value clears that
 * committee's override (→ committee default). Overrides live in the
 * `assigned_advisors` map ({ committee: advisor }).
 */
export async function reassignAdvisorAction(formData: FormData): Promise<void> {
  const admin = await requireWhip();
  const itemId = String(formData.get("itemId") ?? "");
  const committee = String(formData.get("committee") ?? "").trim();
  const advisor = String(formData.get("advisor") ?? "").trim();
  if (!itemId || !committee) return;

  const { data: row } = await admin.from("items").select("assigned_advisors").eq("id", itemId).single();
  const map: Record<string, string> = { ...(row?.assigned_advisors ?? {}) };
  if (advisor) map[committee] = advisor;
  else delete map[committee];

  await admin.from("items").update({ assigned_advisors: map }).eq("id", itemId);
  revalidatePath("/whip");
}

/** Set the plenary-note status for a file. */
export async function setNoteStatusAction(formData: FormData): Promise<void> {
  const admin = await requireWhip();
  const itemId = String(formData.get("itemId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!itemId || !["pending", "submitted", "na"].includes(status)) return;
  await admin
    .from("items")
    .update({
      note_status: status,
      note_submitted_at: status === "submitted" ? new Date().toISOString() : null,
    })
    .eq("id", itemId);
  revalidatePath("/whip");
}

/**
 * Send every reminder that is due today and has not gone out yet. The daily
 * cron does this on its own; this is the whip's manual nudge, and it is safe to
 * press twice — `whip_reminders` stops a second email per (session, advisor,
 * stage).
 */
export async function sendRemindersAction(): Promise<void> {
  const admin = await requireWhip();
  await sendDueReminders(admin);
  revalidatePath("/whip");
}
