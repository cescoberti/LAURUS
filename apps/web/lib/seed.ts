import type { Session } from "./types";

/**
 * June 2026 part-session, modelled on the reference dashboard.
 * Real report codes (A10-0xxx/2026) verified against the EP Open Data API;
 * titles/rapporteurs/deadlines are representative pending live ingestion (M1→M3).
 */
export const JUNE_2026: Session = {
  month: "June 2026",
  subtitle: "Plenary 18–18 June · Brussels",
  votes: 43,
  allocated: 0,
  withVl: 41,
  days: [
    {
      day: "Mon 15 Jun",
      items: [
        {
          code: "OTH-envi-waste-export-ch",
          title: "ENVI — Shipments of waste: export of mixed municipal waste for recovery to Switzerland",
          committee: "TBD",
          vl: "final",
          docs: { vl: true },
        },
      ],
    },
    {
      day: "Tue 16 Jun",
      items: [
        {
          code: "A10-0153/2026",
          title: "Report on the request for the waiver of the immunity of Salvatore De Meo",
          rapporteur: "Marc Angel",
          committee: "JURI",
          amDeadline: { label: "Split Closed", state: "split" },
          vl: "final",
          docs: { file: true, vl: true, ams: false, split: true },
        },
        {
          code: "A10-0136/2026",
          title: "Production and marketing of forest reproductive material",
          rapporteur: "Herbert Dorfmann",
          committee: "AGRI",
          amDeadline: { label: "AM Closed (10 Jun)", state: "closed" },
          amr: 72,
          vl: "final",
          docs: { file: true, vl: true, ams: true, split: true },
          staff: "FB",
        },
        {
          code: "A10-0142/2026",
          title: "Countering transnational repression",
          rapporteur: "Anna Cavazzini",
          committee: "LIBE",
          amDeadline: { label: "AM Closed (11 Jun)", state: "closed" },
          amr: 41,
          vl: "draft",
          docs: { file: true, vl: true, ams: true },
          staff: "FB",
        },
        {
          code: "A10-0128/2026",
          title: "EU priorities for the 70th session of the UN Commission on the Status of Women",
          rapporteur: "Evelyn Regner",
          committee: "FEMM",
          amDeadline: { label: "AM open", state: "open" },
          vl: "none",
          docs: { file: true },
        },
      ],
    },
    {
      day: "Wed 17 Jun",
      items: [
        {
          code: "A10-0119/2026",
          title: "Cooperation among enforcement authorities on unfair trading practices in the agri-food supply chain",
          rapporteur: "Paolo De Castro",
          committee: "AGRI",
          amDeadline: { label: "AM Closed (09 Jun)", state: "closed" },
          amr: 118,
          vl: "final",
          docs: { file: true, vl: true, ams: true, split: true },
        },
        {
          code: "A10-0101/2026",
          title: "Developing a new EU anti-poverty strategy",
          rapporteur: "Li Andersson",
          committee: "EMPL",
          amDeadline: { label: "AM Closed (09 Jun)", state: "closed" },
          amr: 55,
          vl: "final",
          docs: { file: true, vl: true, ams: true },
          staff: "GR",
        },
      ],
    },
  ],
};

export const MONTHS = ["Jan", "Feb", "Mar", "Mar II", "Apr", "May", "Jun", "Jul"] as const;
