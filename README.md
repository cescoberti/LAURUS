# LAURUS — EP Plenary Companion

**Less paperwork. More wins.** / *Meno scartoffie, più voti vinti.*

A tool for European Parliament political-group advisors: it auto-collects reports,
amendments and voting lists from the EP across 24 languages, consolidates them,
extracts split/separate votes, emails advisors when a voting list changes, and
auto-fills a voting list's *Remarks* column with the referenced amendment text.

## Monorepo layout

```
apps/web            Next.js (App Router) dashboard — Vercel
packages/ingest     EP Open Data API v2 client + polling
packages/parser     DOCX/PDF parsers + deterministic amendment-reference matcher
supabase/migrations Postgres schema + RLS
```

## Data sources (verified 2026-07-12)

- **Primary — EP Open Data API v2** (`https://data.europarl.europa.eu/api/v2`):
  open, no auth, JSON-LD. Documents use the ELI/FRBR model
  (Work → Expression per language → Manifestation per format), so per-language
  DOCX/PDF file references come straight from the API. Poll `/{resource}/feed`
  (~30-day window) for change detection.
- **Fallback — DOCEO files** (`www.europarl.europa.eu/doceo/document/...`):
  bot-gated (HTTP 202, empty body to non-browser clients). Resolve through the
  API manifestation paths where possible; otherwise fetch with a real browser
  context, identifiable User-Agent, and backoff.
- The two-column **amendment text** and **split-part boundaries** live *inside*
  the DOCX/PDF and must be parsed — that is what `packages/parser` is for.

## Running the ingestion locally

```bash
nvm use                    # Node 24 (see .nvmrc)
cp .env.example .env       # no key needed for the EP API dry-run
npm run ingest -- 2026     # lists sittings + a sample report's file manifestations
```

## Tests

```bash
node --test --experimental-strip-types packages/parser/src/*.test.ts
```

The flagship *Remarks* matcher (`packages/parser/src/matchAmendmentRef.ts`) is
**deterministic** — regex + number normalisation only. It never invents text;
unresolved rows (paragraph refs, withdrawn/oral/compromise amendments, missing
numbers) become anomalies for human review.

## Database

```bash
supabase start
supabase db reset          # applies supabase/migrations/0001_init.sql
```

All tables have Row Level Security. Plenary data is read-only to authenticated
advisors; writes happen server-side via the service-role key. Users see only
their own profile, subscriptions and notifications.

## Status

- [x] **M0** — repo, monorepo, schema + RLS, verified EP API client, deterministic matcher
- [ ] **M1** — ingestion + read-only dashboard replicating the reference UI
- [ ] **M2** — consolidated multilingual amendments + split/separate export
- [ ] **M3** — voting-list versioning + email notifications + onboarding
- [ ] **M4** — Remarks auto-fill (IT) validated on a real voting list + anomaly report
