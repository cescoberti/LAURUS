"use client";

import { useActionState } from "react";
import { submitAccessRequestAction, type RequestState } from "@/app/request-access/actions";

const labelClass = "mb-2 block text-[0.75rem] font-semibold tracking-[0.04em] text-ink-500";

export function RequestAccessForm() {
  const [state, formAction, pending] = useActionState<RequestState | undefined, FormData>(submitAccessRequestAction, undefined);

  if (state?.sent) {
    return (
      <div className="rounded-2xl bg-eu-50/80 px-5 py-4 text-eu-900 ring-1 ring-inset ring-eu-200/70">
        <p className="text-[0.9375rem] font-bold">Request received</p>
        <p className="mt-1.5 text-[0.875rem] leading-relaxed text-ink-700">
          An admin has been told. When it is approved you will get an email with your link — check your inbox, and your spam folder
          just in case.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label className={labelClass}>Name</label>
        <input name="name" type="text" required autoFocus autoComplete="name" maxLength={120} className="field" />
      </div>
      <div>
        <label className={labelClass}>Email</label>
        <input name="email" type="email" required autoComplete="email" maxLength={200} className="field" />
      </div>
      <div>
        <label className={labelClass}>
          Who you are <span className="font-normal text-ink-300">(optional)</span>
        </label>
        <input name="note" type="text" maxLength={500} placeholder="e.g. advisor, ECR delegation" className="field" />
      </div>
      {/* Not for people: a bot that fills every field fills this one too. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Company
          <input name="company" type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state?.error && (
        <p className="rounded-xl bg-red-50/80 px-4 py-3 text-[0.875rem] text-red-700 ring-1 ring-inset ring-red-200">{state.error}</p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Sending…" : "Request access"}
      </button>
    </form>
  );
}
