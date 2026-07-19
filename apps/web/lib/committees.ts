/** Standing/special EP committees (acronym → official English name). */
export const COMMITTEES: Array<{ code: string; name: string }> = [
  { code: "AFET", name: "Foreign Affairs" },
  { code: "DROI", name: "Human Rights" },
  { code: "SEDE", name: "Security and Defence" },
  { code: "DEVE", name: "Development" },
  { code: "INTA", name: "International Trade" },
  { code: "BUDG", name: "Budgets" },
  { code: "CONT", name: "Budgetary Control" },
  { code: "ECON", name: "Economic and Monetary Affairs" },
  { code: "FISC", name: "Tax Matters" },
  { code: "EMPL", name: "Employment and Social Affairs" },
  { code: "ENVI", name: "Environment, Public Health and Food Safety" },
  { code: "ITRE", name: "Industry, Research and Energy" },
  { code: "IMCO", name: "Internal Market and Consumer Protection" },
  { code: "TRAN", name: "Transport and Tourism" },
  { code: "REGI", name: "Regional Development" },
  { code: "AGRI", name: "Agriculture and Rural Development" },
  { code: "PECH", name: "Fisheries" },
  { code: "CULT", name: "Culture and Education" },
  { code: "JURI", name: "Legal Affairs" },
  { code: "LIBE", name: "Civil Liberties, Justice and Home Affairs" },
  { code: "AFCO", name: "Constitutional Affairs" },
  { code: "FEMM", name: "Women's Rights and Gender Equality" },
  { code: "PETI", name: "Petitions" },
];

export const COMMITTEE_CODES = new Set(COMMITTEES.map((c) => c.code));

/** Feedback / contact address shown in onboarding and rate-limit messages. */
export const CONTACT_EMAIL = "francesco.berti.liv@gmail.com";
