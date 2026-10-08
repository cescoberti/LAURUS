"use client";

import { useActionState, useState } from "react";
import { loginAction, sendMagicLinkAction, type LoginState, type MagicLinkState } from "@/app/login/actions";
import { GoogleButton, OrDivider } from "./GoogleButton";

const field =
  "w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-eu-600 focus:ring-2 focus:ring-eu-600/15";

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"password" | "link">("password");

  return (
    <div className="space-y-4">
      <GoogleButton next={next} />
      <OrDivider />
      {mode === "password" ? <PasswordForm next={next} /> : <MagicLinkForm next={next} />}
      <button
        type="button"
        onClick={() => setMode((m) => (m === "password" ? "link" : "password"))}
        className="w-full text-center text-[13px] font-medium text-ink-500 hover:text-eu-900"
      >
        {mode === "password" ? "Email me a sign-in link instead" : "Use my password instead"}
      </button>
    </div>
  );
}

function PasswordForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<LoginState | undefined, FormData>(loginAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">Email</label>
        <input name="email" type="email" required autoFocus className={field} />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">Password</label>
        <input name="password" type="password" required className={field} />
      </div>

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="press w-full rounded-lg bg-eu-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-eu-700 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

/** No password at all: a one-time link to the address we already know. */
function MagicLinkForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<MagicLinkState | undefined, FormData>(sendMagicLinkAction, undefined);

  if (state?.sent) {
    return (
      <div className="rounded-lg bg-eu-50 px-4 py-3 text-sm text-eu-900 ring-1 ring-inset ring-eu-200">
        <p className="font-semibold">Check your inbox</p>
        <p className="mt-1 text-[13px] text-ink-700">
          If that address has a LAURUS account, a sign-in link is on its way. It expires in an hour.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">Email</label>
        <input name="email" type="email" required autoFocus className={field} />
      </div>

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="press w-full rounded-lg bg-eu-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-eu-700 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Email me a link"}
      </button>
    </form>
  );
}
