"use client";

import { useState } from "react";

/**
 * Primary way to get a voting list: LAURUS builds it, runs both verification
 * passes and emails it with the report. The request comes back immediately —
 * the checking continues server-side, so nobody watches a spinner.
 */
export function RequestVerifiedVl({ code, lang, block }: { code: string; lang: string; block?: boolean }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const request = async () => {
    setState("working");
    setMessage("");
    try {
      const res = await fetch("/api/vl-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, lang }),
      });
      const body = (await res.json()) as { ok?: boolean; emailedTo?: string; error?: string };
      if (!res.ok || !body.ok) {
        setState("error");
        setMessage(body.error ?? "Something went wrong.");
        return;
      }
      setState("done");
      setMessage(`On its way to ${body.emailedTo}. The email says whether it passed both checks.`);
    } catch (err) {
      setState("error");
      setMessage((err as Error).message);
    }
  };

  const label = state === "working" ? "Sending…" : state === "done" ? "Sent ✓" : `Email me the verified VL · ${lang.toUpperCase()}`;

  return (
    <div className={`flex flex-col gap-1.5 ${block ? "" : "items-end"}`}>
      <button
        onClick={request}
        disabled={state === "working" || state === "done"}
        className={`press inline-flex items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white shadow-sm disabled:cursor-default disabled:opacity-80 ${
          state === "done" ? "bg-laurel-700" : "bg-eu-900 hover:bg-eu-800"
        } ${block ? "w-full justify-between py-3" : "py-2.5"}`}
      >
        <span className="inline-flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 4h16v16H4z" />
            <polyline points="4 7 12 13 20 7" />
          </svg>
          {label}
        </span>
        {block && state === "idle" && <small className="text-xs font-medium opacity-70">two checks, ~1 min</small>}
      </button>

      {state === "done" && <p className={`text-xs text-laurel-700 ${block ? "" : "max-w-[16rem] text-right"}`}>{message}</p>}
      {state === "error" && <p className={`text-xs text-red-600 ${block ? "" : "max-w-[16rem] text-right"}`}>{message}</p>}
    </div>
  );
}
