# @filing-desk/db

Drizzle schema and a Postgres client for Filing Desk. The package exports TypeScript source, so apps import `@filing-desk/db` directly. It has no build step.

## Exports

- `createDb(url)` opens a `postgres` connection pool (max 10) and returns a Drizzle client with the schema attached.
- Table objects: `companies`, `filings`, `documents`, `sections`, `chunks`, `facts`, `messages`, `traces`, `evalCases`, `evalRuns`.

## Schema changes

Edit `src/schema.ts`, then from the repository root:

```bash
pnpm db:push
```

That runs `drizzle-kit push` using `DATABASE_URL`. If the variable is missing, the config falls back to `postgres://filing:filing@localhost:5432/filing_desk`, the same database `docker-compose.yml` creates.

Postgres must be running, and the `vector` extension must exist. The `pgvector/pgvector:pg17` image provides it. Drizzle does not create the extension for you. On a fresh database:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

`chunks.embedding` is `vector(1536)` with an HNSW cosine index. That dimension matches `text-embedding-3-small`.

Column comments live in the root [README](../../README.md#database). The file comment at the top of `src/schema.ts` says what each group of tables is for.
