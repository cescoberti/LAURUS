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
        <label className="mb-1 block text-xs font-medium text-ink-500">Nuova password</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoFocus
          className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-laurel-600 focus:ring-2 focus:ring-laurel-600/15"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">Conferma password</label>
        <input
          name="confirm"
          type="password"
          required
          minLength={8}
          className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-laurel-600 focus:ring-2 focus:ring-laurel-600/15"
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
        className="w-full rounded-lg bg-laurel-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-laurel-700 disabled:opacity-60"
      >
        {pending ? "Salvataggio…" : "Imposta password"}
      </button>
    </form>
  );
}
