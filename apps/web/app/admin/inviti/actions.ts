"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non autorizzato.");
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") throw new Error("Non autorizzato.");
  return { supabase, user };
}

export async function generateInviteAction(formData: FormData): Promise<void> {
  const { supabase, user } = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim() || null;
  await supabase.from("invites").insert({ email, created_by: user.id });
  revalidatePath("/admin/inviti");
}
