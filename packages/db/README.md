# @filing-desk/db

Drizzle schema and Postgres client. Exports TypeScript source (no build step).

## Exports

- `createDb(url)` — postgres.js pool + Drizzle
- Tables: `companies`, `filings`, `documents`, `sections`, `chunks`, `facts`, `messages`, `traces`, `evalCases`, `evalRuns`

## Schema push

```bash
# from repo root; Postgres must be up
docker compose exec postgres psql -U filing -d filing_desk -c "CREATE EXTENSION IF NOT EXISTS vector;"
pnpm db:push
```

Default URL in `drizzle.config.ts`: `postgres://filing:filing@localhost:55432/filing_desk`.

`chunks.embedding` is `vector(1536)` with an HNSW cosine index. Ingest leaves it null; `pnpm embed` fills it with OpenAI `text-embedding-3-small`. `chunks.content` has a GIN full-text index (`to_tsvector('english', content)`).
