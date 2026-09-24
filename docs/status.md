# Status

Track progress here so a new chat knows what is done. Update after each milestone.

## Done

- [x] pnpm workspace: web, api, db, ingest
- [x] Postgres + pgvector + Drizzle schema
- [x] SEC ingest, embeddings (`pnpm embed`), evals
- [x] Agent tools + streaming chat + traces
- [x] **Primary product flow: Research brief**
  - `GET /api/companies/:ticker/brief`
  - UI: scorecard, analyst prompts (Welcome/Prompts), evidence panel, tool trace, filings
  - Deep links: Compare peers · Diff risk factors
- [x] Peer metrics + Filing changes + Evals as supporting screens
- [x] **Filings search + in-app document view**
  - `GET /api/search` (index or full-text over chunks)
  - `GET /api/filings/:accession`, `/api/sections/:id`, `/api/documents/:id`
  - UI: filters → results grid → document drawer (sections / exhibits) → Diff / Peer metrics
- [x] **Section matrix**
  - Peer mode: `GET /api/matrix?item=&tickers=&year=`
  - Same-company years: wizard (company → filings → section) via `section-filings` + `matrix/by-accessions`

## Sample data

Ingested: **NVDA, AAPL**. Chunks stored without embeddings (`pnpm embed -- NVDA AAPL` fills them).

## Optional next

- [ ] Ingest more watchlist tickers for fuller eval coverage
- [x] Section tree from stored HTML (level 0 items, level 1 subsections) and two-pane document viewer
- [ ] Tighten section heading heuristics (e.g. MSFT Item 7)
- [ ] Persist multi-turn research briefs per ticker

## Notes

1. Read `AGENTS.md` and `docs/architecture.md` (see **Primary use case**).
2. Postgres host port **55432**. Chat and `pnpm embed` need `OPENAI_API_KEY`. Embeddings are `text-embedding-3-small` (1536). Ingest skips them.
