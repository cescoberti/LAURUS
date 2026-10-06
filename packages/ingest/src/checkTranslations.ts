/**
 * Are the amendments of a given file out in my language yet?
 *
 *   npm run check-translations -- B10-0423/2026 B10-0424/2026        # it
 *   npm run check-translations -- B10-0424/2026 fr                   # one language
 *   npm run check-translations -- --any B10-0423/2026 B10-0424/2026  # first one ready wins
 *
 * Read-only, no database, no key: it enumerates the file's AMENDMENT_LIST
 * blocks from `/api/v2/documents` and asks each block's metadata which
 * language Expressions exist. A block whose Expression for the language is
 * missing has not been translated yet — the DOCX is simply not published, so
 * `syncAmendments` would 404 on it.
 *
 * Exit code 0 when every block of every file is there — or, with `--any`,
 * as soon as ONE file is complete, which is what you want when either file
 * being ready is enough to start working. 1 while nothing qualifies, so:
 *
 *   until npm run -s check-translations -- B10-0424/2026; do sleep 600; done
 */
import { fetchBytes } from "./httpFetch.ts";

const BASE = "https://data.europarl.europa.eu";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2).map((s) => s.trim()).filter(Boolean);
const ANY = args.includes("--any");
const rest = args.filter((a) => a !== "--any");
const LANG = (rest.find((a) => /^[a-z]{2}$/.test(a)) ?? "it").toLowerCase();
const CODES = rest.filter((a) => !/^[a-z]{2}$/.test(a));

if (!CODES.length) {
  console.error("usage: check-translations [--any] <code…> [lang]   e.g. B10-0424/2026 it");
  process.exit(2);
}

/** 'B10-0424/2026' (or 'B10-0424', 'B-10-2026-0424') → identifier stem + year. */
function stemOf(code: string): { stem: string; year: number } {
  let m = code.match(/^([A-Z])-?(\d{1,2})-(\d{4})-(\d{4})$/i);
  if (m) return { stem: `${m[1]!.toUpperCase()}-${m[2]}-${m[3]}-${m[4]}`, year: Number(m[3]) };
  m = code.match(/^([A-Z]+)(\d{1,2})[-_](\d{4})(?:\/(\d{4}))?$/i);
  if (!m) throw new Error(`unrecognised file code: ${code}`);
  const year = Number(m[4] ?? new Date().getFullYear());
  return { stem: `${m[1]!.toUpperCase()}-${m[2]}-${year}-${m[3]}`, year };
}

async function getJson(url: string): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const { status, body } = await fetchBytes(`${url}&format=application%2Fld%2Bjson`);
    if (status === 204) return { data: [] };
    if ((status === 403 || status === 429) && attempt < 3) {
      await sleep(30_000);
      continue;
    }
    if (status !== 200) throw new Error(`${url} → HTTP ${status}`);
    return JSON.parse(body.toString("utf8"));
  }
}

/** Every AMENDMENT_LIST block of the year whose identifier sits on this file. */
async function blocksOf(stem: string, year: number): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 500) {
    const json = await getJson(
      `${BASE}/api/v2/documents?year=${year}&work-type=AMENDMENT_LIST&limit=500&offset=${offset}`,
    );
    const rows: { identifier: string }[] = json.data ?? [];
    out.push(...rows.map((r) => r.identifier).filter((id) => id?.startsWith(`${stem}-AM-`)));
    if (rows.length < 500) return out.sort();
    await sleep(500);
  }
}

/** Amendment range a block covers: 'B-10-2026-0424-AM-041-044' → '41–44'. */
function rangeOf(id: string): string {
  const m = id.match(/-AM-(\d+)-(\d+)$/);
  if (!m) return id;
  const from = Number(m[1]), to = Number(m[2]);
  return from === to ? `${from}` : `${from}–${to}`;
}

/** When the language's DOCX was published, or null when there is none yet. */
async function issuedIn(id: string, lang: string): Promise<string | null> {
  const json = await getJson(`${BASE}/api/v2/documents/${id}?`);
  const doc = json.data?.[0];
  for (const expr of doc?.is_realized_by ?? []) {
    if (!String(expr.id).endsWith(`/${lang}`)) continue;
    for (const man of expr.is_embodied_by ?? []) {
      if (String(man.id).endsWith("/docx")) return man.issued ?? "";
    }
  }
  return null;
}

let allComplete = true;
let oneComplete = false;

for (const code of CODES) {
  const { stem, year } = stemOf(code);
  const blocks = await blocksOf(stem, year);
  if (!blocks.length) {
    console.log(`\n${code} — no amendment block tabled on this file (yet)`);
    continue;
  }

  const missing: string[] = [];
  const done: string[] = [];
  for (const id of blocks) {
    const issued = await issuedIn(id, LANG);
    (issued === null ? missing : done).push(rangeOf(id));
    await sleep(300);
  }

  const label = `${code} — ${done.length}/${blocks.length} blocks in ${LANG.toUpperCase()}`;
  if (missing.length) {
    allComplete = false;
    console.log(`\n${label}\n  still missing: Am ${missing.join(", ")}`);
  } else {
    oneComplete = true;
    console.log(`\n${label} — complete ✓`);
  }
}

const done = ANY ? oneComplete : allComplete;
console.log(done ? (ANY ? "\nOne file is ready." : "\nAll requested files are fully translated.") : "\nStill waiting.");
process.exit(done ? 0 : 1);
