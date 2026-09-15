import { TopNav } from "@/components/TopNav";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMMITTEES } from "@/lib/committees";
import { EU_LANGUAGES } from "@/lib/languages";
import type { Analysis, ProposedAction } from "@/lib/inbox/triage";
import { approveInboxAction, ignoreInboxAction, reopenInboxAction } from "./actions";

export const dynamic = "force-dynamic";

interface Attachment {
  filename: string;
  content_type: string;
  size: number;
  storage_path: string;
}

interface Message {
  id: string;
  from_email: string;
  from_name: string | null;
  to_email: string;
  subject: string | null;
  received_at: string;
  text_body: string | null;
  attachments: Attachment[];
  kind: "document" | "request" | "other";
  analysis: Analysis | null;
  proposed_action: ProposedAction | null;
  status: "new" | "handled" | "ignored";
  handled_at: string | null;
  note: string | null;
}

const MAILBOX = process.env.INBOX_ADDRESS ?? "inbox@laurus.the361.eu";
const HELLO = process.env.HELLO_ADDRESS ?? "hello@laurus.the361.eu";

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });
}

function kb(n: number): string {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { all } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("users").select("role").eq("id", user.id).single() : { data: null };
  const isAdmin = profile?.role === "admin";

  let messages: Message[] = [];
  const links = new Map<string, string>();
  if (isAdmin) {
    const admin = createAdminClient();
    let q = admin.from("inbox_messages").select("*").order("received_at", { ascending: false }).limit(100);
    if (!all) q = q.eq("status", "new");
    messages = ((await q).data as Message[] | null) ?? [];
    // Short-lived download links for the stored attachments.
    const paths = messages.flatMap((m) => m.attachments.map((a) => a.storage_path)).filter((p) => !p.startsWith("ERROR"));
    if (paths.length) {
      const { data } = await admin.storage.from("inbox").createSignedUrls(paths, 3600);
      for (const s of data ?? []) if (s.signedUrl && s.path) links.set(s.path, s.signedUrl);
    }
  }

  return (
    <div className="min-h-screen">
      <TopNav active="admin" />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="display text-[1.75rem] font-extrabold text-eu-900">Inbox</h1>
            <p className="mt-1 text-sm text-ink-500">
              Documents to <span className="font-mono text-eu-700">{MAILBOX}</span>, people to <span className="font-mono text-eu-700">{HELLO}</span>. Each email is read and
              comes with the one thing to do about it — you approve.
            </p>
          </div>
          <a href={all ? "/admin/inbox" : "/admin/inbox?all=1"} className="press rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-ink-500 hover:bg-slate-50">
            {all ? "Open only" : "Show handled too"}
          </a>
        </div>

        {!isAdmin && <p className="mt-8 text-sm text-ink-300">Admins only.</p>}

        {isAdmin && messages.length === 0 && (
          <p className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-ink-300">
            {all ? "Nothing received yet." : "Inbox zero."}
          </p>
        )}

        <div className="mt-6 grid gap-4">
          {messages.map((m) => (
            <MessageCard key={m.id} m={m} links={links} />
          ))}
        </div>
      </main>
    </div>
  );
}

function KindChip({ kind }: { kind: Message["kind"] }) {
  const tone = kind === "document" ? "bg-eu-50 text-eu-900" : kind === "request" ? "bg-gold-300/40 text-ink-900" : "bg-slate-100 text-ink-500";
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] ${tone}`}>{kind}</span>;
}

function MessageCard({ m, links }: { m: Message; links: Map<string, string> }) {
  const a = m.proposed_action;
  const open = m.status === "new";
  return (
    <article className={`rounded-2xl border bg-white p-5 shadow-card ${open ? "border-slate-200" : "border-slate-100 opacity-75"}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
        <KindChip kind={m.kind} />
        <span className="font-semibold text-ink-900">{m.from_name ?? m.from_email}</span>
        {m.from_name && <span className="text-ink-300">{m.from_email}</span>}
        <span className="text-ink-300">→ {m.to_email}</span>
        <span className="ml-auto">{when(m.received_at)}</span>
      </div>
      <h2 className="mt-1.5 text-[15px] font-semibold text-ink-900">{m.subject ?? "(no subject)"}</h2>

      {m.analysis?.summary ? (
        <p className="mt-1 text-sm text-ink-700">{m.analysis.summary}</p>
      ) : (
        <p className="mt-1 text-sm italic text-ink-300">Not triaged (ANTHROPIC_API_KEY missing when it arrived) — read it below.</p>
      )}

      {m.attachments.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {m.attachments.map((att) => {
            const url = links.get(att.storage_path);
            const failed = att.storage_path.startsWith("ERROR");
            return (
              <li key={att.storage_path}>
                {url ? (
                  <a href={url} className="press inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-eu-900 hover:bg-eu-50" title={att.content_type}>
                    📎 {att.filename} <span className="text-ink-300">{kb(att.size)}</span>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1 text-xs text-red-700" title={att.storage_path}>
                    📎 {att.filename} {failed ? "· not stored" : ""}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {m.text_body && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-ink-500 hover:text-ink-900">Email text</summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-ink-700">{m.text_body.slice(0, 6000)}</pre>
        </details>
      )}

      {/* The one thing to do */}
      {open && a && a.type !== "none" && (
        <form action={approveInboxAction} className="mt-4 rounded-xl border border-eu-100 bg-eu-50/60 p-4">
          <input type="hidden" name="id" value={m.id} />
          {a.type === "create_invite" && (
            <>
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-eu-900">Create invite &amp; email it</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <label className="text-xs text-ink-500">
                  Email
                  <input name="email" defaultValue={a.email} className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-ink-900" />
                </label>
                <label className="text-xs text-ink-500">
                  Name
                  <input name="full_name" defaultValue={a.full_name ?? ""} placeholder="as in the email" className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-ink-900" />
                </label>
                <label className="text-xs text-ink-500">
                  VL language
                  <select name="vl_language" defaultValue={a.vl_language} className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-ink-900">
                    {EU_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <CommitteePicker selected={a.committees} />
              {a.ep_group && <p className="mt-2 text-xs text-ink-500">Group: {a.ep_group}</p>}
            </>
          )}
          {a.type === "update_committees" && (
            <>
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-eu-900">Update committees of {a.email}</div>
              <CommitteePicker selected={a.committees} />
            </>
          )}
          {a.type === "file_document" && (
            <div className="text-sm text-ink-700">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-eu-900">File as</span> {a.document_type}
              {a.about ? ` · ${a.about}` : ""}
              <p className="mt-1 text-xs text-ink-500">Stored above. Automatic import (agenda → part-session, list → file) comes as soon as we have real examples.</p>
            </div>
          )}
          {a.type === "reply_needed" && (
            <div className="text-sm text-ink-700">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-eu-900">Needs a reply</span> — {a.reason}
              <p className="mt-1 text-xs text-ink-500">
                <a href={`mailto:${m.from_email}?subject=${encodeURIComponent(`Re: ${m.subject ?? ""}`)}`} className="font-medium text-eu-700 hover:underline">
                  Reply by email
                </a>
              </p>
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button type="submit" className="press rounded-lg bg-eu-900 px-4 py-2 text-sm font-semibold text-white hover:bg-eu-800">
              {a.type === "create_invite" ? "Approve & send invite" : a.type === "update_committees" ? "Approve" : "Mark handled"}
            </button>
            <button type="submit" formAction={ignoreInboxAction} className="press rounded-lg px-3 py-2 text-sm font-medium text-ink-500 hover:bg-slate-100">
              Ignore
            </button>
          </div>
        </form>
      )}
      {open && (!a || a.type === "none") && (
        <form action={ignoreInboxAction} className="mt-4 flex items-center gap-2">
          <input type="hidden" name="id" value={m.id} />
          <button type="submit" formAction={approveInboxAction} className="press rounded-lg bg-eu-900 px-4 py-2 text-sm font-semibold text-white hover:bg-eu-800">
            Mark handled
          </button>
          <button type="submit" className="press rounded-lg px-3 py-2 text-sm font-medium text-ink-500 hover:bg-slate-100">
            Ignore
          </button>
        </form>
      )}

      {!open && (
        <form action={reopenInboxAction} className="mt-3 flex items-center gap-3 text-xs text-ink-500">
          <input type="hidden" name="id" value={m.id} />
          <span className={`inline-flex items-center gap-1.5 font-semibold ${m.status === "handled" ? "text-laurel-700" : "text-ink-500"}`}>
            <span className={`h-[7px] w-[7px] rounded-full ${m.status === "handled" ? "bg-laurel-600" : "bg-slate-300"}`} />
            {m.status === "handled" ? "Handled" : "Ignored"}
            {m.handled_at ? ` · ${when(m.handled_at)}` : ""}
          </span>
          {m.note && <span className="text-ink-500">{m.note}</span>}
          <button type="submit" className="ml-auto text-ink-300 hover:text-ink-900">
            Reopen
          </button>
        </form>
      )}
    </article>
  );
}

function CommitteePicker({ selected }: { selected: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {COMMITTEES.map((c) => (
        <label key={c.code} className="cursor-pointer" title={c.name}>
          <input type="checkbox" name="committees" value={c.code} defaultChecked={selected.includes(c.code)} className="peer sr-only" />
          <span className="press inline-block rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold tracking-[0.06em] text-ink-500 peer-checked:border-eu-900 peer-checked:bg-eu-900 peer-checked:text-white">
            {c.code}
          </span>
        </label>
      ))}
    </div>
  );
}
