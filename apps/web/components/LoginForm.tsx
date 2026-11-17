"use client";

import { useActionState, useState } from "react";
import { loginAction, sendMagicLinkAction, type LoginState, type MagicLinkState } from "@/app/login/actions";
import { GoogleButton, OrDivider } from "./GoogleButton";

const field = "field";
const labelClass = "mb-2 block text-[0.75rem] font-semibold tracking-[0.04em] text-ink-500";

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"password" | "link">("password");

  return (
    <div className="space-y-6">
      <GoogleButton next={next} />
      <OrDivider />
      {mode === "password" ? <PasswordForm next={next} /> : <MagicLinkForm next={next} />}
      <button
        type="button"
        onClick={() => setMode((m) => (m === "password" ? "link" : "password"))}
        className="press w-full rounded-full py-1.5 text-center text-[0.8125rem] font-semibold text-ink-400 hover:text-eu-900"
      >
        {mode === "password" ? "Email me a sign-in link instead" : "Use my password instead"}
      </button>
    </div>
  );
}

function PasswordForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<LoginState | undefined, FormData>(loginAction, undefined);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={next} />

      <div>
        <label className={labelClass}>Email</label>
        <input name="email" type="email" required autoFocus className={field} />
      </div>

      <div>
        <label className={labelClass}>Password</label>
        <input name="password" type="password" required className={field} />
      </div>

      {state?.error && (
        <p className="rounded-xl bg-red-50/80 px-4 py-3 text-[0.875rem] text-red-700 ring-1 ring-inset ring-red-200">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary w-full"
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
      <div className="rounded-2xl bg-eu-50/80 px-5 py-4 text-eu-900 ring-1 ring-inset ring-eu-200/70">
        <p className="text-[0.9375rem] font-bold">Check your inbox</p>
        <p className="mt-1.5 text-[0.875rem] leading-relaxed text-ink-700">
          If that address has a LAURUS account, a sign-in link is on its way. It expires in an hour.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className={labelClass}>Email</label>
        <input name="email" type="email" required autoFocus className={field} />
      </div>

      {state?.error && (
        <p className="rounded-xl bg-red-50/80 px-4 py-3 text-[0.875rem] text-red-700 ring-1 ring-inset ring-red-200">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary w-full"
      >
        {pending ? "Sending…" : "Email me a link"}
      </button>
    </form>
  );
}
