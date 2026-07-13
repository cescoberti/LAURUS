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

export function VlBadge({ status }: { status: VlStatus }) {
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

/** Muted chip for features that ship with a later milestone. */
function ComingSoon({ label, milestone }: { label: string; milestone: string }) {
  return (
    <span title={`Disponibile con ${milestone}`} className="cursor-default text-xs font-medium text-ink-300">
      {label}
    </span>
  );
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
      <ComingSoon label="AMs" milestone="M2" />
      <ComingSoon label="VL" milestone="M3" />
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
