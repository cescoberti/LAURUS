/** The 24 official EU languages (ISO 639-1) with native labels. */
export const EU_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "bg", label: "Български" },
  { code: "cs", label: "Čeština" },
  { code: "da", label: "Dansk" },
  { code: "de", label: "Deutsch" },
  { code: "el", label: "Ελληνικά" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "et", label: "Eesti" },
  { code: "fi", label: "Suomi" },
  { code: "fr", label: "Français" },
  { code: "ga", label: "Gaeilge" },
  { code: "hr", label: "Hrvatski" },
  { code: "hu", label: "Magyar" },
  { code: "it", label: "Italiano" },
  { code: "lt", label: "Lietuvių" },
  { code: "lv", label: "Latviešu" },
  { code: "mt", label: "Malti" },
  { code: "nl", label: "Nederlands" },
  { code: "pl", label: "Polski" },
  { code: "pt", label: "Português" },
  { code: "ro", label: "Română" },
  { code: "sk", label: "Slovenčina" },
  { code: "sl", label: "Slovenščina" },
  { code: "sv", label: "Svenska" },
];

export const EU_LANGUAGE_CODES = new Set(EU_LANGUAGES.map((l) => l.code));

/** Members' default working languages. */
export const DEFAULT_LANGUAGES = ["it", "en"];

/**
 * The languages LAURUS offers for documents today: the working language of
 * the group's advisors, the EP's lingua franca, and Dutch. The ingest keeps
 * collecting all 24 — this is only what the interface offers to download.
 * The interface itself is English-only.
 */
export const DOCUMENT_LANGUAGE_CODES = ["it", "en", "nl"] as const;

export const DOCUMENT_LANGUAGES = EU_LANGUAGES.filter((l) =>
  (DOCUMENT_LANGUAGE_CODES as readonly string[]).includes(l.code),
).sort(
  (a, b) =>
    DOCUMENT_LANGUAGE_CODES.indexOf(a.code as (typeof DOCUMENT_LANGUAGE_CODES)[number]) -
    DOCUMENT_LANGUAGE_CODES.indexOf(b.code as (typeof DOCUMENT_LANGUAGE_CODES)[number]),
);

export const DOCUMENT_LANGUAGE_SET = new Set<string>(DOCUMENT_LANGUAGE_CODES);

/** Clamp any stored/requested language to what the interface offers. */
export function documentLanguage(code: string | null | undefined, fallback = "it"): string {
  const c = (code ?? "").toLowerCase();
  return DOCUMENT_LANGUAGE_SET.has(c) ? c : fallback;
}
