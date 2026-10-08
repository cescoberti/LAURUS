"use client";

import { useFormStatus } from "react-dom";
import { signInWithGoogleAction } from "@/app/login/actions";

function Button({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="press flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-900 shadow-sm hover:bg-slate-50 disabled:opacity-60"
    >
      <GoogleMark />
      {pending ? "Opening Google…" : label}
    </button>
  );
}

/** Google's own mark, drawn inline so no third-party asset is loaded. */
function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * Google sign-in. A plain form posting to a server action, so it works
 * before React has hydrated — the one button that must never be dead.
 */
export function GoogleButton({
  next = "/",
  token,
  label = "Continue with Google",
}: {
  next?: string;
  token?: string;
  label?: string;
}) {
  return (
    <form action={signInWithGoogleAction}>
      <input type="hidden" name="next" value={next} />
      {token && <input type="hidden" name="token" value={token} />}
      <Button label={label} />
    </form>
  );
}

export function OrDivider({ children = "or" }: { children?: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-slate-200" />
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-300">{children}</span>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
