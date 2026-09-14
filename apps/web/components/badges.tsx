import Link from "next/link";
import type { DisplayItem, VlStatus } from "@/lib/types";

// Subtle per-committee tint so the eye can group rows at a glance.
const COMMITTEE_TINT: Record<string, string> = {
  AGRI: "bg-[#eef6e9] text-[#4a6b2a] ring-[#d3e6c3]",
  JURI: "bg-[#eef1fb] text-[#3b4a8a] ring-[#d3daf3]",
  LIBE: "bg-[#fdeef3] text-[#8a3b5c] ring-[#f3d3e0]",
  FEMM: "bg-[#faeefb] text-[#7a3b8a] ring-[#ecd3f3]",
  EMPL: "bg-[#fef4e8] text-[#8a5f2a] ring-[#f3e2c3]",
  ENVI: "bg-[#e9f6f2] text-[#2a6b57] ring-[#c3e6db]",
  TBD: "bg-slate-100 text-slate-500 ring-slate-200",
};

export function CommitteeChip({ code }: { code: string }) {
  const tint = COMMITTEE_TINT[code] ?? "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${tint}`}>
      {code}
    </span>
  );
}

/**
 * What the file's voting-list material looks like right now. `vl_status` is
 * the member-facing state (draft/final); before that, the amendment count is
 * the honest signal: > 0 means the VL can be generated from the file page.
 */
export function VlBadge({ status, amCount = 0 }: { status: VlStatus; amCount?: number }) {
  if (status === "none" && amCount > 0) {
    return (
      <span
        title={`${amCount} amendment${amCount === 1 ? "" : "s"} loaded — VL ready to generate`}
        className="inline-flex items-center gap-1 rounded-md bg-laurel-50 px-2 py-0.5 text-xs font-semibold text-laurel-800 ring-1 ring-inset ring-laurel-200"
      >
        {amCount} AM
      </span>
    );
  }
  if (status === "final") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-laurel-800 px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
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
        <a
          href={item.fileUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-laurel-600 transition-colors hover:text-laurel-800 hover:underline"
        >
          File
        </a>
      ) : (
        <span className="cursor-default text-xs font-medium text-ink-300">File</span>
      )}
      {item.amCount > 0 ? (
        <Link
          href={`/items/${item.code}`}
          title="Amendments loaded — request the VL from the file page"
          className="text-xs font-medium text-laurel-600 transition-colors hover:text-laurel-800 hover:underline"
        >
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
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-laurel-700 text-[11px] font-semibold text-white ring-2 ring-white shadow-sm">
      {initials}
    </span>
  );
}
