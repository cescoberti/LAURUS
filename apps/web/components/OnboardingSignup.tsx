"use client";

import { useActionState } from "react";
import { signupWithTokenAction, type SignupState } from "@/app/onboarding/actions";
import { GoogleButton, OrDivider } from "./GoogleButton";

/** Self-serve account creation from a valid invite link. */
export function OnboardingSignup({ token, presetEmail }: { token: string; presetEmail: string | null }) {
  const [state, action, pending] = useActionState<SignupState | undefined, FormData>(signupWithTokenAction, undefined);

  // On success the server signed the user in; reload so the page shows the wizard.
  if (state?.ok && typeof window !== "undefined") window.location.reload();

  return (
    <div className="card p-10">
      <h1 className="display text-display-sm font-bold text-eu-900">Welcome to LAURUS</h1>
      <p className="lede mt-5">Create your account to get started.</p>

      <div className="mt-6 space-y-4">
        <GoogleButton token={token} label="Sign up with Google" />
        <OrDivider>or with a password</OrDivider>
      </div>

      <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="text-sm font-medium text-ink-900">Email</label>
          <input
            type="email"
            name="email"
            required
            defaultValue={presetEmail ?? ""}
            readOnly={!!presetEmail}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-eu-600 focus:outline-none read-only:bg-slate-50 read-only:text-ink-500"
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
            className="field mt-2"
          />
        </div>
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="btn-primary w-full"
        >
          {pending ? "Creating…" : "Create account & continue"}
        </button>
      </form>
    </div>
  );
}
