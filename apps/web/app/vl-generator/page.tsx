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
      <TopNav active="VL Generator" />

      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-bold text-ink-900">VL Generator</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-500">
          Carica la <em>indicative voting list</em> del Tabling Service: LAURUS compila la colonna{" "}
          <strong>Remarks</strong> con il testo pubblicato degli emendamenti (IT, fallback EN) e ti
          restituisce il DOCX pronto. I Remarks già scritti a mano non vengono mai toccati.
        </p>

        <form
          action="/api/vl-generator"
          method="post"
          encType="multipart/form-data"
          className="mt-6 flex max-w-2xl flex-col gap-4 rounded-xl border border-slate-200/80 bg-white p-6 shadow-card"
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
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-ink-700 file:mr-3 file:rounded-md file:border-0 file:bg-laurel-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-laurel-800"
          />
          <button
            type="submit"
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-laurel-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-laurel-900"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Genera annotated VL
          </button>
          <p className="text-xs text-ink-300">
            Il file scaricato è <code className="font-mono">annotated-vl-&lt;rapporteur&gt;.docx</code>{" "}
            nello stesso formato B/N del Tabling Service.
          </p>
        </form>

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
            Relazioni con emendamenti già scaricati ({covered?.length ?? 0})
          </h2>
          {covered && covered.length > 0 ? (
            <CoveredReportsList reports={covered as CoveredReport[]} />
          ) : (
            <p className="mt-3 text-sm text-ink-300">
              Nessun emendamento ancora ingerito — lancia{" "}
              <code className="font-mono">npm run sync-amendments</code>.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
