import type { Item, VlStatus } from "@/lib/types";

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

export function AmDeadline({ item }: { item: Item }) {
  if (!item.amDeadline) return <span className="text-sm text-ink-300">–</span>;
  const { label, state } = item.amDeadline;
  const style =
    state === "closed"
      ? "bg-slate-100 text-ink-700 ring-slate-200"
      : state === "split"
        ? "bg-[#eef1fb] text-[#3b4a8a] ring-[#d3daf3]"
        : "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}>
        {label}
      </span>
      {item.amr != null && (
        <span className="inline-flex rounded-md bg-laurel-50 px-1.5 py-0.5 text-[11px] font-semibold text-laurel-700 ring-1 ring-inset ring-laurel-100">
          AMR {item.amr}
        </span>
      )}
    </div>
  );
}

function DocLink({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <button
      className={`text-xs font-medium transition-colors ${
        muted ? "text-ink-300 cursor-default" : "text-laurel-600 hover:text-laurel-800 hover:underline"
      }`}
      disabled={muted}
    >
      {label}
    </button>
  );
}

export function DocLinks({ item }: { item: Item }) {
  const d = item.docs;
  return (
    <div className="flex items-center gap-2">
      <span title="Notifications" className="text-ink-300 hover:text-gold-500 cursor-pointer">🔔</span>
      {d.file && <DocLink label="File" />}
      {d.vl && <DocLink label="VL" />}
      <DocLink label="AMs" muted={!d.ams} />
      {d.split && <DocLink label="Split" />}
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
