"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

/** Reassign a file's advisor. Empty value clears the override (→ committee default). */
export async function reassignAdvisorAction(formData: FormData): Promise<void> {
  const admin = await requireWhip();
  const itemId = String(formData.get("itemId") ?? "");
  const advisor = String(formData.get("advisor") ?? "").trim();
  if (!itemId) return;
  await admin.from("items").update({ assigned_advisor: advisor || null }).eq("id", itemId);
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
