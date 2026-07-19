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
