"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type Role = "admin" | "member";

export interface CreateUserState {
  error?: string;
  success?: { email: string };
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non autorizzato.");

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") throw new Error("Non autorizzato.");
}

export async function createUserAction(
  _prev: CreateUserState | undefined,
  formData: FormData,
): Promise<CreateUserState> {
  await requireAdmin();

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const role: Role = formData.get("role") === "admin" ? "admin" : "member";

  if (!email || !email.includes("@")) {
    return { error: "Email non valida." };
  }

  const admin = createAdminClient();
  const { data, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName || undefined },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
  });
  if (inviteError || !data.user) {
    return { error: inviteError?.message ?? "Errore durante l'invito." };
  }

  const { error: profileError } = await admin
    .from("users")
    .insert({ id: data.user.id, email, full_name: fullName || null, role });
  if (profileError) {
    return { error: profileError.message };
  }

  revalidatePath("/admin/users");
  return { success: { email } };
}
