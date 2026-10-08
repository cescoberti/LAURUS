"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState | undefined, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "Email o password non corretti." };
  }

  redirect(next.startsWith("/") ? next : "/");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Ways in that are not a password
// ---------------------------------------------------------------------------

function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3010").replace(/\/+$/, "");
}

/**
 * Google. The invite token, when there is one, rides along in a short-lived
 * cookie: Google will not carry it, and /auth/callback needs it to tell an
 * invited colleague from a stranger with a Google account.
 */
export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  const nextRaw = String(formData.get("next") ?? "/");
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";
  const token = String(formData.get("token") ?? "");

  if (token) {
    (await cookies()).set("laurus_invite", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 15 * 60,
      path: "/",
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { access_type: "offline", prompt: "select_account" },
    },
  });

  if (error || !data.url) redirect("/login?error=oauth-failed");
  redirect(data.url);
}

export interface MagicLinkState {
  error?: string;
  sent?: boolean;
}

/**
 * A link by email instead of a password. `shouldCreateUser: false` keeps the
 * invite gate intact: the link only ever reaches an account that exists.
 * The reply is deliberately the same whether or not it does — it must not
 * become a way to find out who has a LAURUS account.
 */
export async function sendMagicLinkAction(
  _prev: MagicLinkState | undefined,
  formData: FormData,
): Promise<MagicLinkState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) return { error: "Please enter a valid email address." };

  const nextRaw = String(formData.get("next") ?? "/");
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  // Rate limiting is worth saying out loud; "no such account" is not.
  if (error && /rate|limit|too many/i.test(error.message)) {
    return { error: "Too many links requested. Wait a minute and try again." };
  }
  return { sent: true };
}
