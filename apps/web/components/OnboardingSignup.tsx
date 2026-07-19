"use client";

import { useActionState } from "react";
import { signupWithTokenAction, type SignupState } from "@/app/onboarding/actions";

/** Self-serve account creation from a valid invite link. */
export function OnboardingSignup({ token, presetEmail }: { token: string; presetEmail: string | null }) {
  const [state, action, pending] = useActionState<SignupState | undefined, FormData>(signupWithTokenAction, undefined);

  // On success the server signed the user in; reload so the page shows the wizard.
  if (state?.ok && typeof window !== "undefined") window.location.reload();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8">
      <h1 className="text-xl font-bold text-ink-900">Welcome to LAURUS 👋</h1>
      <p className="mt-1 text-sm text-ink-500">Create your account to get started.</p>

      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="text-sm font-medium text-ink-900">Email</label>
          <input
            type="email"
            name="email"
            required
            defaultValue={presetEmail ?? ""}
            readOnly={!!presetEmail}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-laurel-400 focus:outline-none read-only:bg-slate-50 read-only:text-ink-500"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-ink-900">Password</label>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            placeholder="at least 8 characters"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder:text-ink-300 focus:border-laurel-400 focus:outline-none"
          />
        </div>
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-laurel-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-laurel-900 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create account & continue"}
        </button>
      </form>
    </div>
  );
}
