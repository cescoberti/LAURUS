export * from "./epApi.ts";

/** ISO 639-1 codes for the 24 official EU languages used across EP documents. */
export const EU_LANGUAGES = [
  "bg", "cs", "da", "de", "el", "en", "es", "et", "fi", "fr", "ga", "hr",
  "hu", "it", "lt", "lv", "mt", "nl", "pl", "pt", "ro", "sk", "sl", "sv",
] as const;

export type EuLanguage = (typeof EU_LANGUAGES)[number];

/** EP document-type vocabulary values relevant to LAURUS (verified in the API). */
export const WORK_TYPES = {
  report: "REPORT_PLENARY",
  amendment: "AMENDMENT_PLENARY",
  amendmentList: "AMENDMENT_LIST", // voting lists
} as const;
