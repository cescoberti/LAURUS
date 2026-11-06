/**
 * The same facts as `texts-tabled`, from the EP Open Data API instead of the
 * plenary web page.
 *
 * `plenary-documents/{id}` carries, for a report, everything the "Texts tabled"
 * page prints and two things it does not:
 *
 *   - the rapporteur as a PERSISTENT PERSON ID (`person/2341`) rather than a
 *     printed name, which is the only safe key across sources — names collide,
 *     get transliterated and change;
 *   - every report, not just the ten the page shows. Half the items waiting for
 *     a name (A10-0275, A10-0271, A10-0268 …) had already scrolled off it.
 *
 *   workHadParticipation: [
 *     { participation_role: 'def/ep-roles/AUTHOR',         had_participant_organization: ['org/AFET'] },
 *     { participation_role: 'def/ep-roles/RAPPORTEUR_CO',  had_participant_person: ['person/2341'],
 *       participation_in_name_of: 'org/AFET', precedenceOrder: 101 },
 *   ]
 *
 * Names are NOT resolved here: that needs the network, and a caller that
 * guessed would write `person/2341` into a column a member reads. The ingest
 * side resolves the ids against the members list and refuses the row if any id
 * is unknown.
 *
 * Verified 2026-10-27 against A-10-2026-0277 (joint AFET/DEVE report, two
 * co-rapporteurs), 0276 and 0272.
 */

/** A plenary-document Work, cut down to the fields read here. */
export interface EpWork {
  label?: string;
  identifier?: string;
  document_date?: string;
  title_dcterms?: Record<string, string>;
  creator?: string[];
  is_realized_by?: Array<{ title_alternative?: Record<string, string>; title?: Record<string, string> }>;
  workHadParticipation?: Array<{
    participation_role?: string;
    had_participant_person?: string[];
    had_participant_organization?: string[];
    participation_in_name_of?: string;
    precedenceOrder?: number;
  }>;
}

export interface TabledReportRefs {
  /** `A10-0277/2026`, as the page and the database write it. */
  code: string;
  /** `['person/2341', 'person/197498']`, in the Parliament's own precedence order. */
  rapporteurIds: string[];
  /** Responsible committees: the AUTHOR organisations, in payload order. */
  committees: string[];
  title: string;
  /** `2025/0227(COD)` when the title carries one. */
  procedureRef: string | null;
  /** Tabling date, ISO — the Work's own date, the day the DEPOT event records. */
  tabledOn: string | null;
}

const LEAD_ROLES = new Set(["def/ep-roles/RAPPORTEUR", "def/ep-roles/RAPPORTEUR_CO"]);
const AUTHOR = "def/ep-roles/AUTHOR";
// An opinion rapporteur (RAPPORTEUR_OPINION) is not the file's rapporteur and
// is deliberately not in LEAD_ROLES, nor is a shadow.
const CODE = /^([A-Z]+)(\d+)-(\d+)\/(\d{4})$/;
const PROCEDURE = /\b(\d{4}\/\d{4}\([A-Z]+\))/;
const COMMITTEE = /^[A-Z][A-Z0-9]{1,8}$/;

/** `A10-0277/2026` → `A-10-2026-0277`, the id the API answers to. */
export function reportCodeToWorkId(code: string): string | null {
  const m = CODE.exec(code.trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[4]}-${m[3]!.padStart(4, "0")}`;
}

/** The first title in any language, English first — only its text is used. */
function anyTitle(labels: Record<string, string> | undefined): string {
  if (!labels) return "";
  return labels.en ?? Object.values(labels)[0] ?? "";
}

/**
 * What the Work says about who wrote the report. Returns null when the payload
 * is not a report Work we can key on — a missing `label` means there is nothing
 * to match against the database, and guessing it from the id would be worse.
 */
export function reportRefsFromWork(work: EpWork): TabledReportRefs | null {
  const code = work.label?.trim();
  if (!code || !CODE.test(code)) return null;

  const parts = work.workHadParticipation ?? [];
  const leads = parts
    .filter((p) => p.participation_role && LEAD_ROLES.has(p.participation_role))
    .map((p, i) => ({ p, i }))
    // precedenceOrder is the only ordering field the payload carries; payload
    // order is the tie-break so the result is stable either way. It is NOT the
    // order the web page prints: on both co-rapporteured reports checked on
    // 27/10/2026 (A10-0277, A10-0272) the page named them the other way round,
    // Section III's rapporteur and the lead committee's first. Two cases are
    // not a rule, so the field is taken as it stands rather than inverted —
    // worth revisiting if whoever reads items.rapporteur minds the order.
    .sort((a, b) => (a.p.precedenceOrder ?? Infinity) - (b.p.precedenceOrder ?? Infinity) || a.i - b.i)
    .flatMap(({ p }) => p.had_participant_person ?? []);

  const committees = parts
    .filter((p) => p.participation_role === AUTHOR)
    .flatMap((p) => p.had_participant_organization ?? [])
    .map((org) => org.replace(/^org\//, ""))
    // Committees are acronyms; `org/EU_PARLIAMENT` is the publisher and
    // `org/1558` is a delegation, neither of which is a responsible committee.
    .filter((acr) => acr !== "EU_PARLIAMENT" && COMMITTEE.test(acr));

  const title = anyTitle(work.title_dcterms);
  const alt = work.is_realized_by?.map((e) => anyTitle(e.title_alternative)).find(Boolean) ?? "";

  return {
    code,
    rapporteurIds: [...new Set(leads)],
    committees: [...new Set(committees)],
    title: title || anyTitle(work.is_realized_by?.[0]?.title),
    procedureRef: PROCEDURE.exec(alt)?.[1] ?? null,
    tabledOn: work.document_date ?? null,
  };
}
