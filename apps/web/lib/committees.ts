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

/**
 * Eligible ECR advisors per committee (mirrors the ECR onboarding map). Used to
 * scope the whip advisor dropdown to the file's own committee instead of a
 * global list. The advisor actually assigned (from `committee_advisors`) is
 * always selectable even if not listed here.
 */
export const COMMITTEE_CANDIDATES: Record<string, string[]> = {
  AFET: ["Angelo Cialfi", "Timo Eloranta", "Grzegorz Fido-Wawrzyniak", "Ramin Ibragimov", "Aleksander Gruk", "Leyla Obreja", "Blagovest Tichev", "Walter van Luik"],
  DROI: ["Marta De Bonis", "Timo Eloranta", "Jacek Kurski", "Walter van Luik"],
  SEDE: ["Angelo Cialfi", "Grzegorz Fido-Wawrzyniak", "Aleksander Gruk", "Leyla Obreja", "Walter van Luik"],
  DEVE: ["Marta De Bonis", "Katarzyna Michalkiewicz", "Niklas Milthers"],
  INTA: ["Timo Eloranta", "Andrea Guglielmi", "Ramin Ibragimov", "Aleksander Gruk", "Alari Soikmets"],
  BUDG: ["Francesco Berti", "Ekaterina Frolova", "Adam Kusnirik", "Jan van Brussel", "Kamila Wrzesinska"],
  CONT: ["Francesco Berti", "Ekaterina Frolova", "Adam Kusnirik", "Jan van Brussel", "Kamila Wrzesinska", "Piotr Zielinski"],
  ECON: ["Francesco Berti", "Karlis Bumeisters", "Alexander De Vroede", "Stanislaw Kogut", "Andrea Maellare", "Paolo Palamiti", "Ralph Packet", "Ivan Perkovic"],
  FISC: ["Francesco Berti", "Karlis Bumeisters", "Alexander De Vroede", "Stanislaw Kogut", "Andrea Maellare", "Paolo Palamiti", "Ralph Packet", "Ivan Perkovic"],
  EMPL: ["Madalina Codreanu", "Stanislaw Kogut", "Katarzyna Ochman-Kaminska", "Sandro Zampolli"],
  ENVI: ["Monika Bazantova", "Russell Darke", "Alexander De Vroede", "Giuseppe Di Mambro", "Francisco Ochoa Espinar", "Soraya Lemaire", "Slawomir Miozga", "Weronika Paruch", "Heinrich Reuss", "Massimiliano Rizzo", "Dovile Rucyte"],
  SANT: ["Soraya Lemaire", "Slawomir Miozga", "Weronika Paruch", "Massimiliano Rizzo", "Dovile Rucyte"],
  ITRE: ["Lieve Hoonaert", "Liviu Natea", "Weronika Paruch", "Grzegorz Krzyzanowski", "Elena Poletti", "Maxim Raym", "Heinrich Reuss", "Bastien Rondeau-Firmas", "Jorge Vidal Aquilue", "Aleksandra Zamarajewa"],
  IMCO: ["Grzegorz Fido-Wawrzyniak", "Lieve Hoonaert", "Luize Lagzdina", "Liviu Natea", "Myriam Sanasi", "Christian Sentinelli", "Filip Swiderski"],
  TRAN: ["Francesco Di Giuseppe", "Christofer Frisk", "Ance Gulbe", "Maxim Raym", "Myriam Sanasi", "Jan van Brussel", "Lukasz Wielocha", "Izabela Wojtyczka"],
  REGI: ["Stanislaw Kogut", "Andrea Maellare", "Paolo Palamiti", "Boguslaw Rogalski", "Carmela Scirè"],
  AGRI: ["Martina Angelini", "Sandita Florea", "Anita Gulam Lalic", "Slawomir Miozga", "Christine van Dijk", "Emilia Vavrekova"],
  PECH: ["Martina Angelini", "Anita Gulam Lalic", "Niklas Milthers", "Filip Swiderski"],
  CULT: ["Antonia Dimitrova", "Maja Machaj-Branchu", "Christian Sentinelli", "Blagovest Tichev"],
  JURI: ["Marcin Drwiecki", "Alexandru Nica", "Luca Pavanato", "Marcin Skrzypek", "Piotr Zielinski"],
  LIBE: ["Jannes De Jong", "Marcin Drwiecki", "Otto Helantera", "Richard Lundgren", "Katarzyna Michalkiewicz", "Bastien Rondeau-Firmas", "Carmela Scirè", "Lukasz Wielocha"],
  AFCO: ["Marcin Drwiecki", "Anna Kantor", "Francesco Nardacchione", "Alexandru Nica", "Ralph Packet"],
  FEMM: ["Soraya Lemaire", "Maja Machaj-Branchu", "Sandro Zampolli"],
  PETI: ["Lola Alonso-Lamberti", "Glykeria Bismpa", "Antonia Dimitrova", "Katarzyna Ochman-Kaminska", "Marta Lipinska", "Francesco Nardacchione"],
  EUDS: ["Angelo Cialfi", "Raphaël De Montferrand", "Marcin Drwiecki", "Andrea Guglielmi", "Jacek Kurski"],
  HOUS: ["Madalina Codreanu", "Sandro Zampolli"],
};

/** Feedback / contact address shown in onboarding and rate-limit messages. */
export const CONTACT_EMAIL = "francesco.berti.liv@gmail.com";
