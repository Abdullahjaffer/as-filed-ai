# @filing-desk/ingest

SEC EDGAR ingest CLI and eval runner.

```bash
# from repo root
pnpm ingest -- NVDA AAPL
pnpm ingest                 # packages/ingest/watchlist.json
pnpm ingest:reparse -- NVDA # rebuild sections from stored HTML
pnpm ingest:decode          # decode HTML entities already stored in sections and chunks
pnpm eval                   # seed + score packages/ingest/eval-cases.json
```

Requires `SEC_USER_AGENT` and `DATABASE_URL`. Ingest stores chunks without embeddings. `pnpm embed -- NVDA AAPL` fills them with OpenAI `text-embedding-3-small` (1536). Chat also needs `OPENAI_API_KEY`.

Document download caps (per ticker): 4×10-K, 8×10-Q, 2×DEF 14A, 20× recent 8-K. All matching form metadata still lands in `filings`; Forms 3/4/5 are indexed without full text.

`outline.ts` is the form catalog (item codes, noise titles, parser version). The heading walker stores a section tree and chunks only the leaves. `pnpm ingest:reparse` reruns that step when `documents.parser_version` is behind, without downloading from EDGAR again.
