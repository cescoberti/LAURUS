import type { MouseEvent } from "react";
import type { DisplayItem } from "@/lib/types";

/**
 * Committee code. A hairline capsule rather than a filled tag: on this
 * ground a solid block of colour on every row would be noise, so only the
 * member's own committees are allowed to carry the EU blue.
 */
export function CommitteeChip({ code, mine }: { code: string; mine?: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[0.6875rem] font-bold tracking-[0.1em] ${
        mine ? "bg-eu-900 text-white shadow-glow-eu" : "text-ink-400 ring-1 ring-inset ring-ink-900/[0.09]"
      }`}
    >
      {code}
    </span>
  );
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });
}

/** A state dot with its own halo — small, lit, and never flat. */
function Dot({ tone }: { tone: "final" | "pending" | "idle" }) {
  const look =
    tone === "final"
      ? "bg-laurel-600 ring-laurel-600/20"
      : tone === "pending"
        ? "bg-gold-500 ring-gold-500/20"
        : "bg-ink-300 ring-ink-300/20";
  return <span className={`h-[6px] w-[6px] shrink-0 rounded-full ring-[3px] ${look}`} />;
}

/**
 * State of the file's list material. The EP's own list, when the live sync
 * has it: laurel dot = final, brass dot = still indicative / re-issued.
 * Before that, the amendment count is the honest signal.
 */
export function ListState({ item }: { item: DisplayItem }) {
  const vl = item.officialVl;
  if (vl) {
    const label = vl.versionLabel.replace(/\s+VERSION/i, "").toLowerCase();
    const final = /final/i.test(vl.versionLabel);
    const reissued = /\/\s*\d+$/.test(vl.versionLabel);
    return (
      <span
        className="inline-flex items-center gap-2 text-[0.8125rem] font-semibold text-ink-900"
        title={`${vl.versionLabel} · fetched ${timeOf(vl.fetchedAt)}`}
      >
        <Dot tone={final && !reissued ? "final" : "pending"} />
        <span className="capitalize">{label}</span>
        <span className="font-medium tabular-nums text-ink-300">{timeOf(vl.fetchedAt)}</span>
      </span>
    );
  }
  if (item.amCount > 0) {
    return (
      <span
        className="inline-flex items-center gap-2 text-[0.8125rem] font-semibold text-ink-700"
        title="Amendments loaded — the EP's list is not out yet"
      >
        <Dot tone="idle" />
        Amendments in
      </span>
    );
  }
  return <span className="text-[0.8125rem] text-ink-400">No list yet</span>;
}

/**
 * Follow star: brass when on. A drawn star, not the ★ glyph — the glyph
 * changes shape with the font and sits off the optical centre.
 */
export function Star({ on, onToggle }: { on: boolean; onToggle: (e: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={on ? "Following — alerts on" : "Follow this file"}
      title={on ? "Following — you get an email when its list or amendments change" : "Follow: email within minutes when its list or amendments change"}
      className={`press grid h-10 w-10 place-items-center rounded-full ${
        on ? "text-gold-500 hover:bg-gold-500/10" : "text-ink-300 hover:bg-ink-900/[0.05] hover:text-ink-500"
      }`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={on ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 3.6l2.6 5.28 5.83.85-4.21 4.1.99 5.8L12 16.89l-5.21 2.74.99-5.8-4.21-4.1 5.83-.85z" />
      </svg>
    </button>
  );
}
