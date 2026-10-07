/**
 * Are the amendments of a given file out in my language yet?
 *
 *   npm run check-translations -- B10-0423/2026 B10-0424/2026        # it
 *   npm run check-translations -- B10-0424/2026 fr                   # one language
 *   npm run check-translations -- --any B10-0423/2026 B10-0424/2026  # first one ready wins
 *
 * Read-only, no database, no key: it enumerates the file's AMENDMENT_LIST
 * blocks from `/api/v2/documents`, then asks for each block's DOCX in the
 * language — because that is the file the ingestion downloads, and the file
 * is the only honest answer.
 *
 * Not the metadata. The API's language Expressions lag the distribution
 * store by hours: on 2026-10-07 B-10-2026-0423-AM-005-008 listed no Italian
 * Expression while `..._it.docx` served 54 KB of Italian, and the ingestion
 * had already parsed all 14 amendments. Asking the metadata made this check
 * say "still waiting" about a translation that was sitting there.
 *
 * The language goes in lowercase: `..._it.docx` is served, `..._IT.docx` is
 * a 404.
 *
 * Exit code 0 when every block of every file is there — or, with `--any`,
 * as soon as ONE file is complete, which is what you want when either file
 * being ready is enough to start working. 1 while nothing qualifies, so:
 *
 *   until npm run -s check-translations -- B10-0424/2026; do sleep 600; done
 */
import { amendmentBlockUrl } from "@laurus/parser";
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

/** Is this block's DOCX served in the language? One ranged GET, no body. */
async function existsIn(id: string, lang: string): Promise<boolean> {
  const url = amendmentBlockUrl(id, lang.toLowerCase());
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { status } = await fetchBytes(url, 5, { Range: "bytes=0-0" });
      if (status === 200 || status === 206) return true;
      if (status === 404) return false;
      // 403/429/5xx: the host is rate-limiting, not answering about the file.
      await sleep(5_000 * (attempt + 1));
    } catch {
      await sleep(5_000 * (attempt + 1)); // a timeout says nothing either
    }
  }
  throw new Error(`cannot tell whether ${id} exists in ${lang}`);
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
    const there = await existsIn(id, LANG);
    (there ? done : missing).push(rangeOf(id));
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
