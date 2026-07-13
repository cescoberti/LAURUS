import Link from "next/link";
import type { DayGroup } from "@/lib/types";
import { CommitteeChip, DocLinks, StaffAvatar, VlBadge } from "./badges";

const HEAD = ["Code", "Title", "Cmte", "VL", "Docs", "Staff"];

export function ItemTable({ group }: { group: DayGroup }) {
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h3 className="text-sm font-semibold text-ink-900">{group.day}</h3>
        <span className="text-xs text-ink-300">{group.items.length} items</span>
      </div>

      <div className="scroll-x overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              {HEAD.map((h) => (
                <th key={h} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group.items.map((item, i) => (
              <tr
                key={item.code}
                className={`group border-b border-slate-50 transition-colors hover:bg-laurel-50/40 ${
                  i % 2 ? "bg-slate-50/30" : ""
                }`}
              >
                <td className="px-4 py-3 align-top">
                  <Link
                    href={`/items/${item.code}`}
                    className="font-mono text-[13px] font-medium text-laurel-900 hover:text-laurel-700 hover:underline"
                  >
                    {item.code}
                  </Link>
                </td>
                <td className="max-w-[420px] px-4 py-3 align-top">
                  <Link href={`/items/${item.code}`} className="text-sm leading-snug text-ink-900 hover:text-laurel-800">
                    {item.title}
                  </Link>
                  {item.rapporteur && (
                    <p className="mt-0.5 text-xs text-ink-500">{item.rapporteur}</p>
                  )}
                </td>
                <td className="px-4 py-3 align-top"><CommitteeChip code={item.committee} /></td>
                <td className="px-4 py-3 align-top"><VlBadge status={item.vl} /></td>
                <td className="px-4 py-3 align-top"><DocLinks item={item} /></td>
                <td className="px-4 py-3 align-top"><StaffAvatar initials={item.staff} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
