/** Standing/special EP committees (acronym → Italian name). */
export const COMMITTEES: Array<{ code: string; name: string }> = [
  { code: "AFET", name: "Affari esteri" },
  { code: "DROI", name: "Diritti umani" },
  { code: "SEDE", name: "Sicurezza e difesa" },
  { code: "DEVE", name: "Sviluppo" },
  { code: "INTA", name: "Commercio internazionale" },
  { code: "BUDG", name: "Bilanci" },
  { code: "CONT", name: "Controllo dei bilanci" },
  { code: "ECON", name: "Problemi economici e monetari" },
  { code: "FISC", name: "Questioni fiscali" },
  { code: "EMPL", name: "Occupazione e affari sociali" },
  { code: "ENVI", name: "Ambiente, sanità pubblica e sicurezza alimentare" },
  { code: "ITRE", name: "Industria, ricerca ed energia" },
  { code: "IMCO", name: "Mercato interno e protezione dei consumatori" },
  { code: "TRAN", name: "Trasporti e turismo" },
  { code: "REGI", name: "Sviluppo regionale" },
  { code: "AGRI", name: "Agricoltura e sviluppo rurale" },
  { code: "PECH", name: "Pesca" },
  { code: "CULT", name: "Cultura e istruzione" },
  { code: "JURI", name: "Giuridica" },
  { code: "LIBE", name: "Libertà civili, giustizia e affari interni" },
  { code: "AFCO", name: "Affari costituzionali" },
  { code: "FEMM", name: "Diritti delle donne e uguaglianza di genere" },
  { code: "PETI", name: "Petizioni" },
];

export const COMMITTEE_CODES = new Set(COMMITTEES.map((c) => c.code));

/** Feedback / contact address shown in onboarding and rate-limit messages. */
export const CONTACT_EMAIL = "francesco.berti.liv@gmail.com";
