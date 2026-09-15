import Link from "next/link";
import type { MouseEvent } from "react";
import type { DisplayItem, VlStatus } from "@/lib/types";

/** Committee code; the member's own committees read in EU blue. */
export function CommitteeChip({ code, mine }: { code: string; mine?: boolean }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold tracking-[0.06em] ${
        mine ? "bg-eu-50 text-eu-900" : "bg-slate-100 text-ink-500"
      }`}
    >
      {code}
    </span>
  );
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });
}

/**
 * State of the file's list material. The EP's own list, when the live sync
 * has it: laurel dot = final, amber dot = still indicative / re-issued.
 * Before that, the amendment count is the honest signal.
 */
export function ListState({ item }: { item: DisplayItem }) {
  const vl = item.officialVl;
  if (vl) {
    const label = vl.versionLabel.replace(/\s+VERSION/i, "").toLowerCase();
    const final = /final/i.test(vl.versionLabel);
    const reissued = /\/\s*\d+$/.test(vl.versionLabel);
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-900" title={`${vl.versionLabel} · fetched ${timeOf(vl.fetchedAt)}`}>
        <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${final && !reissued ? "bg-laurel-600" : "bg-amber-500"}`} />
        <span className="capitalize">{label}</span>
        <span className="font-medium text-ink-300">{timeOf(vl.fetchedAt)}</span>
      </span>
    );
  }
  if (item.amCount > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-700" title="Amendments loaded — the EP's list is not out yet">
        <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-slate-300" />
        Amendments in
      </span>
    );
  }
  return <span className="text-xs text-ink-300">No list yet</span>;
}

/** Follow star: laurel gold when on. Instant feedback on press. */
export function Star({ on, onToggle }: { on: boolean; onToggle: (e: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={on ? "Following — alerts on" : "Follow this file"}
      title={on ? "Following — you get an email when its list or amendments change" : "Follow: email within minutes when its list or amendments change"}
      className={`press grid h-8 w-8 place-items-center rounded-lg text-[17px] hover:bg-slate-100 ${on ? "text-gold-500" : "text-ink-300"}`}
    >
      {on ? "★" : "☆"}
    </button>
  );
}

/** Member-facing VL state, kept for the file page. */
export function VlBadge({ status, amCount = 0 }: { status: VlStatus; amCount?: number }) {
  if (status === "none" && amCount > 0) {
    return (
      <span
        title={`${amCount} amendment${amCount === 1 ? "" : "s"} loaded — VL ready to generate`}
        className="inline-flex items-center gap-1 rounded-md bg-eu-50 px-2 py-0.5 text-xs font-semibold text-eu-900 ring-1 ring-inset ring-eu-200"
      >
        {amCount} AM
      </span>
    );
  }
  if (status === "final") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-laurel-700 px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-gold-300" />
        Final
      </span>
    );
  }
  if (status === "draft") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-gold-500/10 px-2 py-0.5 text-xs font-semibold text-gold-600 ring-1 ring-inset ring-gold-500/30">
        Draft
      </span>
    );
  }
  return <span className="text-sm text-ink-300">–</span>;
}

export function DocLinks({ item }: { item: DisplayItem }) {
  return (
    <div className="flex items-center gap-2">
      {item.fileUrl ? (
        <a href={item.fileUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-eu-600 transition-colors hover:text-eu-900 hover:underline">
          File
        </a>
      ) : (
        <span className="cursor-default text-xs font-medium text-ink-300">File</span>
      )}
      {item.amCount > 0 ? (
        <Link href={`/items/${item.code}`} title="Amendments loaded — request the VL from the file page" className="text-xs font-medium text-eu-600 transition-colors hover:text-eu-900 hover:underline">
          VL
        </Link>
      ) : (
        <span title="No amendments published yet" className="cursor-default text-xs font-medium text-ink-300">
          VL
        </span>
      )}
    </div>
  );
}

export function StaffAvatar({ initials }: { initials?: string }) {
  if (!initials) return <span className="text-sm text-ink-300">–</span>;
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-eu-900 text-[11px] font-semibold text-white ring-2 ring-white shadow-sm">
      {initials}
    </span>
  );
}
