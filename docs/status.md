# Status

Track progress here so a new chat knows what is done. Update after each milestone.

## Done

- [x] pnpm workspace: `@filing-desk/web`, `@filing-desk/api`, `@filing-desk/db`, `@filing-desk/ingest`
- [x] Docker Compose Postgres 17 + pgvector (host port **55432**)
- [x] Drizzle schema including HNSW vector index and FTS GIN on `chunks.content`
- [x] Express health + company/filings/strip/diff/chat/traces/evals routes
- [x] Ant Design + Ant Design X UI (Company, Compare, Changes, Evals)
- [x] SEC ingest CLI (`pnpm ingest -- NVDA`) with filings, XBRL facts, documents, sections, chunks
- [x] Agent tools + `POST /api/chat` (AI SDK `streamText`, `stepCountIs(8)`, traces)
- [x] Frozen eval set (`packages/ingest/eval-cases.json`) + `pnpm eval`
- [x] `AGENTS.md`, `docs/architecture.md`, package READMEs

## Sample data loaded locally

Companies ingested during implementation: **NVDA, AAPL, MSFT, AMD**. Eval run: **16/30** (remaining fails are mostly tickers not yet ingested, plus occasional section parse misses).

## Next improvements (optional)

- [ ] Set `OPENAI_API_KEY` and re-ingest (or re-embed) so `searchFilings` uses vectors
- [ ] Ingest more watchlist tickers for fuller eval coverage
- [ ] Tighten 10-Q / 10-K section heading heuristics (e.g. MSFT Item 7)

## Blocked

(none)

## Notes for the next agent

1. Read `AGENTS.md` and this file.
2. `.env` uses `DATABASE_URL=...@localhost:55432/...`.
3. Chat and embeddings need `OPENAI_API_KEY`. Ingest needs `SEC_USER_AGENT`.
4. Do not edit Cursor plan files under `.cursor/plans` unless asked.
