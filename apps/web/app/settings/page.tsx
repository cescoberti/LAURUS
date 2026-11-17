import { TopNav } from "@/components/TopNav";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_LANGUAGES, DEFAULT_LANGUAGES } from "@/lib/languages";
import { COMMITTEES } from "@/lib/committees";
import { saveSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("users")
    .select("email, full_name, whatsapp_phone, wants_email, wants_whatsapp, wants_clean_final, languages, committees, vl_language")
    .eq("id", user!.id)
    .single();
  const selected = new Set<string>(profile?.languages ?? DEFAULT_LANGUAGES);
  const myCommittees = new Set<string>(profile?.committees ?? []);
  const defaultLang = profile?.vl_language ?? "it";

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-3xl px-8 py-16 lg:px-12 lg:py-22">
        <h1 className="display text-display-md font-bold text-eu-900">Settings</h1>
        <p className="lede mt-5">
          Your working preferences and how you want to be notified when LAURUS has news on your reports.
        </p>

        <form action={saveSettingsAction} className="card mt-12 space-y-10 p-9 sm:p-11">
          <div>
            <p className="text-[1.0625rem] font-bold tracking-[-0.01em] text-ink-900">Committees you follow</p>
            <p className="mb-5 mt-1.5 text-[0.8125rem] text-ink-500">Used to surface the reports that matter to you.</p>
            <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
              {COMMITTEES.map((c) => (
                <label key={c.code} className="press flex items-center gap-2.5 rounded-xl px-3 py-2 text-[0.875rem] text-ink-700 hover:bg-ink-900/[0.035]">
                  <input type="checkbox" name="committees" value={c.code} defaultChecked={myCommittees.has(c.code)} className="accent-eu-700" />
                  <span className="font-mono text-[0.6875rem] font-semibold tracking-wide text-ink-400">{c.code}</span>
                  <span className="truncate">{c.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[1.0625rem] font-bold tracking-[-0.01em] text-ink-900" htmlFor="vl_language">
              Default voting-list language
            </label>
            <select
              id="vl_language"
              name="vl_language"
              defaultValue={defaultLang}
              className="field mt-4 block max-w-xs"
            >
              {DOCUMENT_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.code.toUpperCase()} — {l.label}
                </option>
              ))}
            </select>
          </div>

          <hr className="hairline" />
          <div>
            <label className="text-[1.0625rem] font-bold tracking-[-0.01em] text-ink-900" htmlFor="whatsapp_phone">
              WhatsApp number
            </label>
            <input
              id="whatsapp_phone"
              name="whatsapp_phone"
              type="tel"
              defaultValue={profile?.whatsapp_phone ?? ""}
              placeholder="+39 333 1234567"
              className="field mt-4"
            />
            <p className="mt-3 text-[0.8125rem] text-ink-400">
              With international prefix. Used for reminders and for the WhatsApp bot.
            </p>
          </div>

          <label className="press -mx-3 flex items-start gap-3.5 rounded-2xl px-3 py-2.5 text-[0.9375rem] text-ink-900 hover:bg-ink-900/[0.025]">
            <input type="checkbox" name="wants_email" defaultChecked={profile?.wants_email ?? true} className="mt-0.5 accent-eu-700" />
            <span>
              <span className="font-semibold">Email reminders</span>
              <span className="mt-1 block text-[0.8125rem] leading-relaxed text-ink-500">The official voting list, and the translation finished in your language, on the files you follow.</span>
            </span>
          </label>

          <label className="press -mx-3 flex items-start gap-3.5 rounded-2xl px-3 py-2.5 text-[0.9375rem] text-ink-900 hover:bg-ink-900/[0.025]">
            <input type="checkbox" name="wants_whatsapp" defaultChecked={profile?.wants_whatsapp ?? false} className="mt-0.5 accent-eu-700" />
            <span>
              <span className="font-semibold">WhatsApp reminders</span>
              <span className="mt-1 block text-[0.8125rem] leading-relaxed text-ink-500">The same alerts, on the number above.</span>
            </span>
          </label>

          <label className="press -mx-3 flex items-start gap-3.5 rounded-2xl px-3 py-2.5 text-[0.9375rem] text-ink-900 hover:bg-ink-900/[0.025]">
            <input type="checkbox" name="wants_clean_final" defaultChecked={profile?.wants_clean_final ?? false} className="mt-0.5 accent-eu-700" />
            <span>
              <span className="font-semibold">Final post-vote text by email</span>
              <span className="mt-1 block text-[0.8125rem] leading-relaxed text-ink-500">
                As soon as the EP publishes the adopted text, you get the clean file as an attachment.
              </span>
            </span>
          </label>

          <div>
            <p className="text-[1.0625rem] font-bold tracking-[-0.01em] text-ink-900">Working languages</p>
            <p className="mb-5 mt-1.5 text-[0.8125rem] text-ink-500">
              Annotated VLs are prepared only in the selected languages (default: IT + EN).
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
              {DOCUMENT_LANGUAGES.map((l) => (
                <label key={l.code} className="press flex items-center gap-2.5 rounded-xl px-3 py-2 text-[0.875rem] text-ink-700 hover:bg-ink-900/[0.035]">
                  <input
                    type="checkbox"
                    name="languages"
                    value={l.code}
                    defaultChecked={selected.has(l.code)}
                    className="accent-eu-700"
                  />
                  <span className="font-mono text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-400">{l.code}</span> {l.label}
                </label>
              ))}
            </div>
          </div>

          <button type="submit" className="btn-primary mt-2">
            Save
          </button>
        </form>
      </main>
    </div>
  );
}
