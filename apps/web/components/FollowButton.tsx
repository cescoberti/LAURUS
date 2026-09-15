"use client";

import { useState } from "react";
import { toggleFollowAction } from "@/app/items/actions";

/**
 * Follow a file to be told, within minutes during a plenary week, when its
 * amendments or split/separate requests land. Email always; WhatsApp too when
 * a number is set in Settings.
 */
export function FollowButton({
  itemId,
  code,
  following,
  channels,
}: {
  itemId: string;
  code: string;
  following: boolean;
  channels: string[];
}) {
  const [on, setOn] = useState(following);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    const fd = new FormData();
    fd.set("itemId", itemId);
    fd.set("code", code);
    fd.set("follow", on ? "0" : "1");
    await toggleFollowAction(fd);
    setOn(!on);
    setBusy(false);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={toggle}
        disabled={busy}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-70 ${
          on
            ? "border-laurel-200 bg-laurel-50 text-laurel-800 hover:bg-laurel-100"
            : "border-slate-200 bg-white text-ink-700 hover:border-eu-200 hover:text-eu-900"
        }`}
        title={on ? "You are told when this file's VL material changes" : "Get told when this file's VL material changes"}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {on ? "Following" : "Follow this file"}
      </button>
      {on && (
        <span className="text-[11px] text-ink-300">
          alerts by {channels.length ? channels.join(" + ") : "email"}
        </span>
      )}
    </div>
  );
}
