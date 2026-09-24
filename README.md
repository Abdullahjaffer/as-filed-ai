# Filing Desk

Filing Desk answers questions about public companies from their own SEC filings. Figures come from XBRL facts. Narrative answers quote the filing and link back to EDGAR.

**For LLM coding agents:** start at [AGENTS.md](AGENTS.md). Spec: [docs/architecture.md](docs/architecture.md). Progress: [docs/status.md](docs/status.md).

## Workspace

```text
apps/web            React, Vite, TypeScript, Ant Design, Ant Design X
apps/api            Express, AI SDK agent, read routes
packages/db         Drizzle schema and Postgres client
packages/ingest     SEC ingest CLI + eval runner
docker-compose.yml  Postgres 17 with pgvector (host port 55432)
```

## Stack

| Piece | Choice |
| --- | --- |
| UI | React 19, Vite, Ant Design 6, Ant Design X |
| API | Express 5, Vercel AI SDK |
| Language | TypeScript |
| Database | PostgreSQL 17, pgvector, Drizzle |
| Package manager | pnpm workspaces |

## Setup

```bash
pnpm install
cp .env.example .env   # set SEC_USER_AGENT and OPENAI_API_KEY
docker compose up -d
docker compose exec postgres psql -U filing -d filing_desk -c "CREATE EXTENSION IF NOT EXISTS vector;"
pnpm db:push
pnpm ingest -- NVDA
pnpm eval
pnpm dev
```

- Web: http://localhost:5173  
- API: http://localhost:4000  
- Postgres: `localhost:55432` (mapped from container `5432`)

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Web + API |
| `pnpm ingest -- TICKER` | Pull SEC data for one or more tickers |
| `pnpm ingest` | Pull the watchlist in `packages/ingest/watchlist.json` |
| `pnpm eval` | Seed eval cases and score against local Postgres |
| `pnpm db:push` | Push Drizzle schema |

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Default `postgres://filing:filing@localhost:55432/filing_desk` |
| `SEC_USER_AGENT` | Required for ingest (SEC fair access) |
| `OPENAI_API_KEY` | Chat agent and `pnpm embed` |
| `PORT` | API port (default `4000`) |

## What the app does

**Primary:** Research brief — open a company, read filed XBRL metrics, ask citation-backed questions, inspect evidence, then jump to risk diffs or peer compares.

Supporting screens: Filings (filter and keyword search over the filing index and stored sections, in-app document view), Section matrix (side-by-side latest section snippets), Peer metrics, Filing changes, Evals.

Questions read Postgres only. Ingest is the only path that calls EDGAR.
