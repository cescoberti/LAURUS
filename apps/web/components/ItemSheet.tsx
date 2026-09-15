"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DisplayItem } from "@/lib/types";
import { rapporteurLabel } from "@/lib/rapporteur";
import { project, spring } from "@/lib/spring";
import { CommitteeChip, ListState } from "./badges";
import { RequestVerifiedVl } from "./RequestVerifiedVl";

function voteLabel(iso?: string): string {
  if (!iso) return "Vote date TBD";
  return `Vote ${new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · 12:00`;
}

/**
 * The file's detail as a sheet over the list: springs in from the right,
 * can be grabbed and thrown back the same way, never locks the page.
 * Inside: the facts (amendments, official list), the three things a member
 * does with a file, and the follow switch.
 */
export function ItemSheet({
  item,
  vlLanguage,
  onClose,
  onToggleFollow,
}: {
  item: DisplayItem | null;
  vlLanguage: string;
  onClose: () => void;
  onToggleFollow: (item: DisplayItem) => void;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const x = useRef(0); // current translateX in px; 0 = open
  const anim = useRef<ReturnType<typeof spring> | null>(null);
  const drag = useRef<{ x0: number; base: number; hist: Array<[number, number]> } | null>(null);
  const [shown, setShown] = useState<DisplayItem | null>(item);
  const [mounted, setMounted] = useState(false);

  const width = () => (sheetRef.current?.offsetWidth ?? 480) + 20;
  const paint = (v: number) => {
    x.current = v;
    if (sheetRef.current) sheetRef.current.style.transform = `translateX(${v}px)`;
    const p = 1 - Math.min(1, Math.max(0, v / width()));
    if (scrimRef.current) {
      scrimRef.current.style.opacity = String(p);
      scrimRef.current.style.pointerEvents = p > 0.02 ? "auto" : "none";
    }
  };

  useEffect(() => {
    setMounted(true);
    x.current = width();
    paint(x.current);
    anim.current = spring(() => x.current, paint, { response: 0.32, damping: 1 });
    return () => anim.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open on a new item, close on null — keeping the last item rendered
  // while the sheet leaves, so it does not blank mid-flight.
  useEffect(() => {
    if (!mounted) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (item) {
      setShown(item);
      if (reduced) paint(0);
      else anim.current?.to(0);
    } else if (reduced) {
      paint(width());
    } else {
      anim.current?.to(width());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, mounted]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  // 1:1 drag with the grab offset respected; velocity handoff on release.
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("a, button, input, textarea")) return;
    anim.current?.stop();
    sheetRef.current?.setPointerCapture(e.pointerId);
    drag.current = { x0: e.clientX, base: x.current, hist: [[e.clientX, performance.now()]] };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    let v = d.base + (e.clientX - d.x0);
    if (v < 0) v = (v * 0.55 * 300) / (300 + 0.55 * Math.abs(v)); // rubber-band past the open edge
    paint(v);
    d.hist.push([e.clientX, performance.now()]);
    if (d.hist.length > 6) d.hist.shift();
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const [x1, t1] = d.hist[0]!;
    const [x2, t2] = d.hist[d.hist.length - 1]!;
    const vel = ((x2 - x1) / Math.max(1, t2 - t1)) * 1000;
    if (x.current + project(vel) > width() / 2) {
      anim.current?.to(width(), vel);
      onClose();
    } else {
      anim.current?.to(0, vel);
    }
  };

  const it = shown;
  const canList = !!it && (!!it.officialVl || it.amCount > 0);
  const lang = vlLanguage.toUpperCase();

  return (
    <>
      <div ref={scrimRef} onClick={onClose} className="fixed inset-0 z-30 bg-ink-900/25" style={{ opacity: 0, pointerEvents: "none" }} aria-hidden />
      <aside
        ref={sheetRef}
        aria-hidden={!item}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="fixed bottom-2.5 right-2.5 top-2.5 z-40 flex w-[min(30rem,calc(100vw-20px))] touch-none flex-col overflow-hidden rounded-2xl border border-white/60 bg-[rgba(250,250,247,0.86)] shadow-sheet backdrop-blur-2xl backdrop-saturate-150 will-change-transform"
        style={{ transform: "translateX(110%)" }}
      >
        {it && (
          <>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="press absolute right-3.5 top-3.5 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-ink-500 hover:bg-slate-200"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <header className="px-5 pb-3 pt-4">
              <div className="flex items-center gap-2 text-xs text-ink-500">
                <CommitteeChip code={it.committee} mine={it.mine} />
                <span>{voteLabel(it.voteDate)}</span>
              </div>
              <h2 className="display mt-1.5 pr-8 text-[1.45rem] font-extrabold uppercase text-eu-900">
                {rapporteurLabel(it.rapporteur) ?? it.code}
              </h2>
              <p className="mt-1 text-[15px] leading-snug text-ink-900">{it.title}</p>
              <div className="mt-1.5 font-mono text-xs text-eu-600">{it.code}</div>
            </header>

            <div className="grid gap-3 overflow-y-auto px-5 pb-5">
              <div className="grid grid-cols-2 gap-2.5">
                <Tile k="Amendments" v={it.amCount > 0 ? String(it.amCount) : "—"} />
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">Official list</div>
                  <div className="mt-1.5">
                    <ListState item={it} />
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                {canList ? (
                  <RequestVerifiedVl code={it.code} lang={vlLanguage} block />
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-[13px] text-ink-500">
                    No list material yet — the EP has published neither the list nor the amendments. Follow the file to be told the minute they land.
                  </div>
                )}
                {canList && (
                  <a href={`/api/annotated-vl?code=${encodeURIComponent(it.code)}&lang=${vlLanguage}`} className={btn}>
                    Download unverified · {lang} <small className="text-xs font-medium text-ink-300">.docx</small>
                  </a>
                )}
                {(it.fileUrlLang ?? it.fileUrl) && (
                  <a href={it.fileUrlLang ?? it.fileUrl} target="_blank" rel="noreferrer" className={btn}>
                    Report · EP site <small className="text-xs font-medium text-ink-300">{it.fileUrlLang ? lang : "EN"}</small>
                  </a>
                )}
                <Link href={`/items/${it.code}`} className={btn}>
                  Amendments, splits & separate votes <span aria-hidden>→</span>
                </Link>
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] text-ink-700">
                <button
                  type="button"
                  role="switch"
                  aria-checked={it.following}
                  onClick={() => onToggleFollow(it)}
                  className={`press relative h-5 w-[34px] shrink-0 rounded-full transition-colors ${it.following ? "bg-laurel-600" : "bg-slate-300"}`}
                >
                  <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${it.following ? "translate-x-[16px]" : "translate-x-0.5"}`} />
                </button>
                {it.following ? "Alerts on — an email when the list or the amendments change" : "Alert me by email when the list or the amendments change"}
              </label>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

const btn =
  "press flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-ink-900 hover:bg-slate-50";

function Tile({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">{k}</div>
      <div className="mt-0.5 text-xl font-bold tracking-tight text-ink-900">{v}</div>
    </div>
  );
}
