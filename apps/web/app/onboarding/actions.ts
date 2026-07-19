"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMMITTEE_CODES } from "@/lib/committees";
import { EU_LANGUAGE_CODES, DEFAULT_LANGUAGES } from "@/lib/languages";

interface ValidInvite {
  id: string;
  email: string | null;
}

/** Validate a token: exists, not expired, not used. Uses service role. */
async function validInvite(token: string): Promise<ValidInvite | null> {
  if (!token) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("invites")
    .select("id, email, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at) < new Date()) return null;
  return { id: data.id, email: data.email };
}

export interface SignupState {
  error?: string;
  ok?: boolean;
}

/** Self-serve account creation from a valid invite link. */
export async function signupWithTokenAction(_prev: SignupState | undefined, formData: FormData): Promise<SignupState> {
  const token = String(formData.get("token") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const invite = await validInvite(token);
  if (!invite) return { error: "This invite is not valid or has expired." };
  if (invite.email && invite.email.toLowerCase() !== email) {
    return { error: "This invite is tied to a different email address." };
  }
  if (!email.includes("@")) return { error: "Please enter a valid email." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const admin = createAdminClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // the invite link IS the gate — no confirmation email
  });
  if (createErr || !created.user) {
    const already = /registered|exists/i.test(createErr?.message ?? "");
    return { error: already ? "An account with this email already exists. Please sign in instead." : createErr?.message ?? "Something went wrong." };
  }

  const { error: profileErr } = await admin
    .from("users")
    .insert({ id: created.user.id, email, role: "member" });
  if (profileErr && !/duplicate/i.test(profileErr.message)) {
    return { error: profileErr.message };
  }

  // Sign the new user in so the wizard runs authenticated.
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) return { error: signInErr.message };

  return { ok: true };
}

export interface OnboardingState {
  error?: string;
}

/** Save onboarding preferences and mark the user (and invite) as onboarded. */
export async function completeOnboardingAction(_prev: OnboardingState | undefined, formData: FormData): Promise<OnboardingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Please reload the page." };

  const committees = formData.getAll("committees").map(String).filter((c) => COMMITTEE_CODES.has(c));
  const rawLang = String(formData.get("vl_language") ?? "it");
  const vlLanguage = EU_LANGUAGE_CODES.has(rawLang) ? rawLang : "it";
  const languages = [...new Set([vlLanguage, ...DEFAULT_LANGUAGES])];

  const { error } = await supabase
    .from("users")
    .update({ committees, vl_language: vlLanguage, languages, onboarded_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: error.message };

  // Mark the invite used, if this onboarding came from one.
  const token = String(formData.get("token") ?? "");
  if (token) {
    const admin = createAdminClient();
    await admin
      .from("invites")
      .update({ used_at: new Date().toISOString(), used_by: user.id })
      .eq("token", token)
      .is("used_at", null);
  }

  return {};
}
