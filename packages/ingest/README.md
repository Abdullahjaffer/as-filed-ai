# @filing-desk/ingest

SEC EDGAR ingest CLI and eval runner.

```bash
# from repo root
pnpm ingest -- NVDA AAPL
pnpm ingest                 # packages/ingest/watchlist.json
pnpm eval                   # seed + score packages/ingest/eval-cases.json
```

Requires `SEC_USER_AGENT` and `DATABASE_URL`. Set `OPENAI_API_KEY` to embed chunks (`text-embedding-3-small`). Without it, chunks are stored and keyword search still works.

Document download caps (per ticker): 4×10-K, 8×10-Q, 2×DEF 14A, 20× recent 8-K. All matching form metadata still lands in `filings`; Forms 3/4/5 are indexed without full text.
