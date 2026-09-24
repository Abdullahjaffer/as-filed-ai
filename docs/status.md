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

## Sample data

Ingested: **NVDA, AAPL, MSFT, AMD**. All chunks embedded.

## Optional next

- [ ] Ingest more watchlist tickers for fuller eval coverage
- [ ] Tighten section heading heuristics (e.g. MSFT Item 7)
- [ ] Persist multi-turn research briefs per ticker

## Notes

1. Read `AGENTS.md` and `docs/architecture.md` (see **Primary use case**).
2. Postgres host port **55432**. Chat needs `OPENAI_API_KEY`.
