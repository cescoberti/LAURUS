import { LoginForm } from "@/components/LoginForm";
import { Wordmark } from "@/components/Logo";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>

        {error === "not-invited" && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            That account is not a LAURUS member yet. LAURUS is invite-only — ask an admin for an invite,
            then sign in with the same address.
          </div>
        )}

        {error === "oauth-failed" && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Sign-in did not complete. Please try again.
          </div>
        )}

        {error === "invite-link-invalid" && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            This invite link is not valid or has expired. Ask an admin to re-invite you.
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <LoginForm next={next ?? "/"} />
        </div>
      </div>
    </div>
  );
}
