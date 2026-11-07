// The label itself — surname(s), upper case — is in @laurus/parser, because the
// ingest side compares sources on it (`sync-texts-tabled --check`) and the rule
// has to be the same one the site renders with. What stays here is the file
// name built on top of it.
import { rapporteurLabel } from "@laurus/parser/rapporteur-name";

export { rapporteurLabel };

/** Diacritics folded and anything a file name cannot carry dropped. */
function asciiName(label: string): string {
  return label
    .replace(/\//g, "-")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Stem for a file LAURUS hands back: the rapporteur's surname(s), then who the
 * file is for — `DEL ITA` when the content is Italian, so it is the version
 * that goes to the Italian delegation as it is, the language code otherwise.
 *
 * These files land in a folder held per session, where several rapporteurs'
 * documents sit side by side, so the surname is the handle that finds one
 * again and the suffix says at a glance whether it still needs translating.
 * `fallback` is used when the file has no rapporteur — the report code.
 */
export function fileStem(rapporteur: string | null | undefined, language: string, fallback: string): string {
  const who = rapporteurLabel(rapporteur) ?? fallback;
  const lang = language.toLowerCase();
  return `${asciiName(who)} ${lang === "it" ? "DEL ITA" : lang.toUpperCase()}`;
}
