# Fixtures

Real structured extracts from EP "Results of votes" (VOT) documents, captured
via browser (DOCEO direct-fetch is bot-gated — see [[laurus-project]] memory).
Source: `PV-10-2026-02-12-VOT_EN.html`, Thursday 12 February 2026, Strasbourg.
Captured 2026-07-12.

- `vot-2026-02-12-item-6.1-uganda.json` — resolution with a 4-part split vote,
  quoted boundary text verbatim, RCV requests.
- `vot-2026-02-12-item-6.5-anti-poverty.json` — larger legislative-style
  resolution: separate votes, two 2-part splits, ~20 rows, amendment numbers
  referenced only in the "Requests for roll-call votes" block (no numbered
  amendment survived to the main table here — alternative motions replaced
  them, a real edge case Feature 4 must treat as `not_found`/no-op, not
  invented text).

These confirm the voting_list_rows column layout (`Subject | Am No | Author |
Remarks | Vote | In favour, against, abstentions`) and the split_parts JSON
shape used in `supabase/migrations/0001_init.sql`.

Still needed for M2: a real DOCX/PDF of a report with numbered `Am 12`-style
rows populated in the "Am No" column (all items sampled on this date used
provisional agreements or alternative motions instead), and the AM-NNN-NNN
amendment DOCX itself, to validate the two-column amendment parser.
