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
