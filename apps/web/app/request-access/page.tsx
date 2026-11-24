import Link from "next/link";
import { RequestAccessForm } from "@/components/RequestAccessForm";
import { Wordmark } from "@/components/Logo";

export const metadata = { title: "Request access — LAURUS" };

/** For the person who has no invite yet. An admin decides; nothing here gives access by itself. */
export default function RequestAccessPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-22">
      <div className="w-full max-w-[25rem]">
        <div className="rise flex flex-col items-center text-center">
          <Wordmark size={34} className="scale-[1.15]" />
          <h1 className="display mt-10 text-display-md font-bold text-eu-900">Request access</h1>
          <p className="mt-3 text-[1.0625rem] font-medium text-ink-500">LAURUS is invite-only. An admin will review your request.</p>
        </div>

        <div className="rise rise-2 card-raised mt-12 px-8 py-9">
          <RequestAccessForm />
        </div>

        <p className="rise rise-3 mt-8 text-center text-[0.8125rem] text-ink-400">
          Already a member?{" "}
          <Link href="/login" className="font-semibold text-eu-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
