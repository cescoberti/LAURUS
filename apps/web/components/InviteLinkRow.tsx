"use client";

import { useState } from "react";

/** One invite row with a copy-to-clipboard button for its onboarding link. */
export function InviteLinkRow({
  url,
  email,
  status,
  createdAt,
}: {
  url: string;
  email: string | null;
  status: "active" | "used" | "expired";
  createdAt: string;
}) {
  const [copied, setCopied] = useState(false);
  const badge = {
    active: { label: "Active", cls: "bg-laurel-100 text-laurel-800" },
    used: { label: "Used", cls: "bg-slate-100 text-ink-500" },
    expired: { label: "Expired", cls: "bg-gold-500/15 text-gold-600" },
  }[status];

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200/70 bg-white px-4 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>{badge.label}</span>
          {email && <span className="truncate text-sm text-ink-700">{email}</span>}
          <span className="text-xs text-ink-300">
            {new Date(createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        </div>
        <p className="mt-1 truncate font-mono text-xs text-ink-400">{url}</p>
      </div>
      {status === "active" && (
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="shrink-0 rounded-lg bg-laurel-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-laurel-900"
        >
          {copied ? "Copied ✓" : "Copy link"}
        </button>
      )}
    </div>
  );
}
