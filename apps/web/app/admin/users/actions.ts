"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type Role = "admin" | "whip" | "member";

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
  return user.id;
}

export async function createUserAction(
  _prev: CreateUserState | undefined,
  formData: FormData,
): Promise<CreateUserState> {
  await requireAdmin();

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const roleInput = String(formData.get("role") ?? "member");
  const role: Role = roleInput === "admin" ? "admin" : roleInput === "whip" ? "whip" : "member";

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

/**
 * Delete an advisor's account, so the same address can be invited again — the
 * way out when an invite never arrived and the address now reads "already
 * registered". Removes the sign-in and, by cascade, the profile, the files the
 * member follows and their alert history; usage events keep their rows with
 * the user left blank. The page asks twice before it calls this.
 *
 * Not for yourself and not for another admin: that is how an app ends up with
 * nobody who can sign in to the admin pages.
 */
export async function deleteUserAction(id: string): Promise<{ error?: string }> {
  const me = await requireAdmin();
  if (!id) return { error: "Utente non indicato." };
  if (id === me) return { error: "Non puoi eliminare il tuo stesso account." };

  const admin = createAdminClient();
  const { data: target } = await admin.from("users").select("id, email, role").eq("id", id).maybeSingle();
  if (target?.role === "admin") return { error: "Un admin non si elimina da qui." };

  const { error } = await admin.auth.admin.deleteUser(id);
  // A profile with no sign-in behind it (a half-made invite) is the case this
  // exists for as much as any: "not found" there is not a failure.
  if (error && !/not.?found/i.test(error.message)) return { error: error.message };

  // The cascade has normally taken the profile already; this is for the case
  // where there was no sign-in to cascade from.
  const { error: rowError } = await admin.from("users").delete().eq("id", id);
  if (rowError) return { error: rowError.message };

  revalidatePath("/admin/users");
  return {};
}
