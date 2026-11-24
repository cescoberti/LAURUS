import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";
import { Wordmark } from "@/components/Logo";

/** The first impression: one sheet of paper, centred, surrounded by air. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; status?: string }>;
}) {
  const { next, error, status } = await searchParams;

  // Someone who is not a member tried to sign in: that attempt is already the request
  // (see /auth/callback), so what they need is thanks, not instructions.
  const requested = status === "requested";

  const notice = requested
    ? {
        tone: "ok" as const,
        text: "Thank you for your request. LAURUS is still in beta. An admin will onboard you once you're verified.",
      }
    : error === "oauth-failed"
        ? { tone: "error" as const, text: "Sign-in did not complete. Please try again." }
        : error === "invite-link-invalid"
          ? { tone: "error" as const, text: "This invite link is not valid or has expired. Ask an admin to re-invite you." }
          : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-22">
      <div className="w-full max-w-[25rem]">
        <div className="rise flex flex-col items-center text-center">
          <Wordmark size={34} className="scale-[1.15]" />
          <h1 className="display mt-10 text-display-md font-bold text-eu-900">Less paperwork.</h1>
          <p className="mt-3 text-[1.0625rem] font-medium text-ink-500">More wins.</p>
        </div>

        {notice && (
          <div
            className={`rise rise-1 mt-12 rounded-2xl px-5 py-4 text-[0.875rem] leading-relaxed ${
              notice.tone === "ok"
                ? "bg-eu-50/80 text-eu-900 ring-1 ring-inset ring-eu-200/70"
                : "bg-red-50/80 text-red-700 ring-1 ring-inset ring-red-200"
            }`}
          >
            {notice.text}
          </div>
        )}

        <div className={`rise rise-2 card-raised px-8 py-9 ${notice ? "mt-7" : "mt-14"}`}>
          <LoginForm next={next ?? "/"} />
        </div>

        <p className="rise rise-3 mt-8 text-center text-[0.8125rem] text-ink-500">
          No account yet?{" "}
          <Link href="/request-access" className="font-semibold text-eu-700 hover:underline">
            Request access
          </Link>
        </p>
        <p className="rise rise-3 mt-6 text-center text-xs text-ink-400">
          EP Plenary Companion · invite-only ·{" "}
          <Link href="/privacy" className="hover:underline">
            Privacy
          </Link>
        </p>
      </div>
    </div>
  );
}
