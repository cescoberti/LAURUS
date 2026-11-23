"use client";

import { useActionState } from "react";
import { setPasswordAction, type SetPasswordState } from "@/app/auth/set-password/actions";

export function SetPasswordForm() {
  const [state, formAction, pending] = useActionState<SetPasswordState | undefined, FormData>(
    setPasswordAction,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">New password</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoFocus
          className="field"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">Confirm password</label>
        <input
          name="confirm"
          type="password"
          required
          minLength={8}
          className="field"
        />
      </div>

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary w-full"
      >
        {pending ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}
