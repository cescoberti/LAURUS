"use client";

import { useState } from "react";

/**
 * Primary way to get a voting list: LAURUS builds it, runs both verification
 * passes and emails it with the report. It takes a while because the official
 * VOT and amendment files are re-downloaded and re-read for the second pass —
 * that wait is the point.
 */
export function RequestVerifiedVl({ code, lang }: { code: string; lang: string }) {
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
      const body = (await res.json()) as {
        ok?: boolean;
        verified?: boolean;
        emailedTo?: string;
        issues?: number;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setState("error");
        setMessage(body.error ?? "Something went wrong.");
        return;
      }
      setState("done");
      setMessage(
        body.verified
          ? `Verified and sent to ${body.emailedTo}.`
          : `Sent to ${body.emailedTo} — the report flags ${body.issues} check${body.issues === 1 ? "" : "s"} to read before using it.`,
      );
    } catch (err) {
      setState("error");
      setMessage((err as Error).message);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={request}
        disabled={state === "working"}
        className="inline-flex items-center gap-2 rounded-lg bg-laurel-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-laurel-900 disabled:cursor-default disabled:opacity-70"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 4h16v16H4z" />
          <polyline points="4 7 12 13 20 7" />
        </svg>
        {state === "working" ? "Verifying…" : `Email me the verified VL · ${lang.toUpperCase()}`}
      </button>

      {state === "working" && (
        <p className="max-w-[16rem] text-right text-xs text-ink-300">
          Re-reading the official VOT and amendment files. This takes a minute or two.
        </p>
      )}
      {state === "done" && <p className="max-w-[16rem] text-right text-xs text-laurel-700">{message}</p>}
      {state === "error" && <p className="max-w-[16rem] text-right text-xs text-red-600">{message}</p>}
    </div>
  );
}
