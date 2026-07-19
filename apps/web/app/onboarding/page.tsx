import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OnboardingSignup } from "@/components/OnboardingSignup";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { Wordmark } from "@/components/Logo";

export const dynamic = "force-dynamic";

async function tokenState(token: string | undefined) {
  if (!token) return { valid: false, email: null as string | null };
  const admin = createAdminClient();
  const { data } = await admin
    .from("invites")
    .select("email, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at) < new Date()) return { valid: false, email: null };
  return { valid: true, email: data.email as string | null };
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Authenticated: run the wizard (or bounce out if already onboarded).
  if (user) {
    const { data: profile } = await supabase.from("users").select("onboarded_at").eq("id", user.id).single();
    if (profile?.onboarded_at) redirect("/");
    return (
      <Shell>
        <OnboardingWizard token={token ?? ""} />
      </Shell>
    );
  }

  // Not authenticated: a valid token lets them create an account.
  const { valid, email } = await tokenState(token);
  if (valid) {
    return (
      <Shell>
        <OnboardingSignup token={token ?? ""} presetEmail={email} />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-lg font-bold text-ink-900">Invite not valid</h1>
        <p className="mt-2 text-sm text-ink-500">
          This invite link isn&apos;t valid, has expired, or has already been used. Ask your administrator
          for a new one, or{" "}
          <a href="/login" className="font-medium text-laurel-700 hover:underline">
            sign in
          </a>{" "}
          if you already have an account.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50/60">
      <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-10">
        <div className="mb-8 flex items-center text-laurel-800">
          <Wordmark className="h-6" />
        </div>
        <div className="w-full">{children}</div>
      </div>
    </div>
  );
}
