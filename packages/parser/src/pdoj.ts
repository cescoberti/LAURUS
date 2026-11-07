/**
 * The synoptic final draft agenda (PDOJ) the Plenary Sittings Directorate
 * publishes before each part-session, e.g.
 *
 *   https://www.europarl.europa.eu/sedcms/documents/PRIORITY_INFO/1820/
 *     SYN_PDOJ_November%20I_BRU_EN.pdf
 *
 * It is the only source that names the rapporteur BEFORE the vote. The VOT XML
 * carries the same names in its vote labels, but it is published after the
 * sitting, so a file that has not been voted yet has nobody attached to it —
 * which is why the list showed "No rapporteur" and committee "TBD" for the
 * files it matters most to prepare.
 *
 * One entry occupies two lines of the extracted text:
 *
 *   À • ***I (A10-0271/2026) PAJÍN, VERYGA ENVI/SANT
 *   Union Civil Protection Mechanism and Union support for health emergency…
 *
 * The bullet line carries, in order: an optional deadline marker, an optional
 * procedure marker, the report code in brackets, the rapporteur surname(s) and
 * the responsible committee(s). Surnames and committee codes are both upper
 * case, so the committees are told apart by being known codes at the end of the
 * line — `ENVI/SANT` is two committees, `VASILE-VOICULESCU` is one surname.
 */

/** Committee and sub-committee codes as the PDOJ prints them. */
const COMMITTEES = new Set([
  "AFET", "DEVE", "INTA", "BUDG", "CONT", "ECON", "EMPL", "ENVI", "ITRE",
  "IMCO", "TRAN", "REGI", "AGRI", "PECH", "CULT", "JURI", "LIBE", "AFCO",
  "FEMM", "PETI", "DROI", "SEDE", "FISC", "SANT", "LEGI", "HOUS", "EUDS",
]);

export interface PdojEntry {
  /** `A10-0271/2026`, or null where the PDOJ prints a placeholder like `A10-/`. */
  code: string | null;
  /** Surnames exactly as printed, upper case: `["PAJÍN", "VERYGA"]`. */
  rapporteurs: string[];
  /** `["ENVI", "SANT"]` — more than one when the file is jointly responsible. */
  committees: string[];
  title: string;
  /** `***I`, `*`, `***` … as printed; null for a non-legislative file. */
  procedure: string | null;
  /** The À marker: an amendment or split/separate deadline falls on this file. */
  deadline: boolean;
}

// "• ***I (A10-0271/2026) PAJÍN, VERYGA ENVI/SANT" — the code may be a stub.
const ENTRY = /^(?<marks>[À´\s]*)•\s*(?<procedure>\*{1,3}I?\s*)?\((?<code>[A-Z]\d+-[\d/]*\d{4}|[A-Z]\d+-\/)\)\s*(?<who>.*)$/;
/** Any bullet at all, code or not — a statement or a debate ends a title. */
const ANY_BULLET = /^[À´\s]*•/;

/** `A10-/` and friends carry no number yet. */
function codeOrNull(raw: string): string | null {
  return /^[A-Z]\d+-\d+\/\d{4}$/.test(raw) ? raw : null;
}

/**
 * Splits the tail of a bullet line into surnames and committees. The committees
 * are the trailing run of known codes, possibly joined by `/`; everything
 * before them is the rapporteur list, comma-separated.
 */
function splitWho(who: string): { rapporteurs: string[]; committees: string[] } {
  const tokens = who.trim().split(/\s+/).filter(Boolean);
  const committees: string[] = [];
  while (tokens.length) {
    const last = tokens[tokens.length - 1]!;
    const parts = last.split("/").filter(Boolean);
    if (parts.length > 0 && parts.every((p) => COMMITTEES.has(p))) {
      committees.unshift(...parts);
      tokens.pop();
      continue;
    }
    break;
  }
  const rapporteurs = tokens
    .join(" ")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  return { rapporteurs, committees };
}

/**
 * Every file the agenda lists with a code, in the order the PDOJ prints them.
 * Lines that are not file entries — statements, debates, one-minute speeches,
 * the header — are skipped, and a bullet with no code at all is not an entry.
 */
export function parsePdoj(text: string): PdojEntry[] {
  const lines = text.split("\n").map((l) => l.replace(/\s+$/, ""));
  const out: PdojEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = ENTRY.exec(lines[i] ?? "");
    if (!m?.groups) continue;
    const { rapporteurs, committees } = splitWho(m.groups.who ?? "");
    // The title runs to the next bullet or to a blank line; the PDOJ wraps it
    // without indenting, and sometimes glues a note to it: "…(Vote: 29/04/2026)".
    const title: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j] ?? "";
      if (!l.trim() || ANY_BULLET.test(l) || /^\d{2}:\d{2}/.test(l)) break;
      title.push(l.trim());
    }
    out.push({
      code: codeOrNull(m.groups.code ?? ""),
      rapporteurs,
      committees,
      title: title.join(" ").replace(/\s+/g, " ").trim(),
      procedure: m.groups.procedure?.trim() || null,
      deadline: /À/.test(m.groups.marks ?? ""),
    });
  }
  return out;
}
