"use client";

import { useActionState } from "react";
import { createUserAction, type CreateUserState } from "@/app/admin/users/actions";

export function NewUserForm() {
  const [state, formAction, pending] = useActionState<CreateUserState | undefined, FormData>(
    createUserAction,
    undefined,
  );

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-card">
      <p className="mb-4 text-sm font-semibold text-ink-900">Onboarda un nuovo advisor</p>
      <form action={formAction} className="grid gap-3 sm:grid-cols-[1.4fr_1fr_0.8fr_auto]">
        <input
          name="email"
          type="email"
          required
          placeholder="nome.cognome@epgroup.eu"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-laurel-600 focus:ring-2 focus:ring-laurel-600/15"
        />
        <input
          name="fullName"
          placeholder="Full name"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-laurel-600 focus:ring-2 focus:ring-laurel-600/15"
        />
        <select
          name="role"
          defaultValue="member"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-laurel-600 focus:ring-2 focus:ring-laurel-600/15"
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-laurel-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-laurel-700 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Invite"}
        </button>
      </form>

      {state?.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
          {state.error}
        </p>
      )}

      {state?.success && (
        <div className="mt-3 rounded-lg border border-gold-500/30 bg-gold-500/10 px-3 py-2.5 text-sm">
          <p className="text-ink-900">
            User <code className="font-mono">{state.success.email}</code> invited.
          </p>
          <p className="mt-1 text-xs text-ink-500">
            They&apos;ll get an email from Supabase with a link to set their password.
          </p>
        </div>
      )}
    </div>
  );
}
