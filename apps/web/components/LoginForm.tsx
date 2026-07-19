"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/login/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<LoginState | undefined, FormData>(loginAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">Email</label>
        <input
          name="email"
          type="email"
          required
          autoFocus
          className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-laurel-600 focus:ring-2 focus:ring-laurel-600/15"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">Password</label>
        <input
          name="password"
          type="password"
          required
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
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
