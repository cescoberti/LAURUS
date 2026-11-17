import { TopNav } from "@/components/TopNav";
import { CoveredReportsList, type CoveredReport } from "@/components/CoveredReportsList";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The annotated-VL service: upload the Tabling Service indicative voting list,
 * download it back with Remarks filled from the published amendments.
 */
export default async function VlGeneratorPage() {
  const supabase = await createClient();
  const { data: covered } = await supabase
    .from("items")
    .select("code, title, rapporteur, committee, vote_date, am_count")
    .gt("am_count", 0)
    .order("vote_date", { ascending: false });

  return (
    <div className="min-h-screen">
      <TopNav active="Voting lists" />

      <main className="mx-auto max-w-5xl px-8 py-16 lg:px-12 lg:py-20">
        <h1 className="display text-display-md font-bold text-eu-900">VL Generator</h1>
        <p className="lede mt-5 max-w-2xl">
          Upload the Tabling Service <em>indicative voting list</em>: LAURUS fills the{" "}
          <strong>Remarks</strong> column with the published amendment text (your default language, EN
          fallback) and hands the DOCX back ready to use. Remarks you already wrote by hand are never touched.
        </p>

        <form
          action="/api/vl-generator"
          method="post"
          encType="multipart/form-data"
          className="card mt-8 flex max-w-2xl flex-col gap-5 p-8"
        >
          <label className="text-sm font-semibold text-ink-900" htmlFor="vl">
            Voting list (.docx)
          </label>
          <input
            id="vl"
            name="vl"
            type="file"
            required
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="field file:mr-3 file:rounded-full file:border-0 file:bg-eu-50 file:px-4 file:py-2 file:text-[0.8125rem] file:font-semibold file:text-eu-900"
          />
          <button
            type="submit"
            className="btn-primary w-fit"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Generate annotated VL
          </button>
          <p className="text-xs text-ink-300">
            The downloaded file is <code className="font-mono">&lt;RAPPORTEUR&gt; DEL ITA (draft).docx</code>{" "}
            in the same black-and-white Tabling Service format.
          </p>
        </form>

        <section className="mt-10">
          <h2 className="eyebrow mb-5">
            Reports with amendments available ({covered?.length ?? 0})
          </h2>
          {covered && covered.length > 0 ? (
            <CoveredReportsList reports={covered as CoveredReport[]} />
          ) : (
            <p className="mt-3 text-sm text-ink-300">
              No amendments ingested yet — run{" "}
              <code className="font-mono">npm run sync-amendments</code>.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
