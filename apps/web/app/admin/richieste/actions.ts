"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { approveAccessRequest, rejectAccessRequest } from "@/lib/accessRequests";

async function requireAdmin(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non autorizzato.");
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") throw new Error("Non autorizzato.");
  return user.id;
}

/** Approve or refuse one request from the admin panel (the same two actions as the email's page). */
export async function decideRequestAction(formData: FormData): Promise<void> {
  const userId = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const by = { userId, via: "panel" as const };
  const result = decision === "approve" ? await approveAccessRequest(id, by) : await rejectAccessRequest(id, by);
  revalidatePath("/admin/richieste");
  redirect(`/admin/richieste?r=${encodeURIComponent(result.message)}`);
}
