# Agent guide

This file is for LLM coding agents working in Filing Desk. Humans use [README.md](README.md) for setup. Read [docs/status.md](docs/status.md) before you start so you do not redo finished work. The product spec is [docs/architecture.md](docs/architecture.md).

## Product rules

- A number in an answer must match a stored XBRL row in `facts`, or appear inside a quoted passage from `sections` / `chunks`.
- If the filings do not support the claim, say the filing does not state it. Do not invent figures.
- Questions and chat tools read Postgres only. They never call EDGAR at request time.
- Do not add background job queues or cost monitoring unless the user asks.

## Workspace

| Path | Package | Role |
| --- | --- | --- |
| `apps/web` | `@filing-desk/web` | React, Vite, Ant Design, Ant Design X |
| `apps/api` | `@filing-desk/api` | Express API, agent, read routes |
| `packages/db` | `@filing-desk/db` | Drizzle schema and `createDb` |
| `packages/ingest` | `@filing-desk/ingest` | SEC client, ingest CLI, chunking, embeddings |

pnpm workspaces. Node 22+, pnpm 10, Docker for Postgres.

## Commands

```bash
pnpm install
cp .env.example .env
docker compose up -d
# once per fresh DB:
docker compose exec postgres psql -U filing -d filing_desk -c "CREATE EXTENSION IF NOT EXISTS vector;"
pnpm db:push
pnpm ingest -- NVDA          # one ticker
pnpm ingest                  # watchlist in packages/ingest/watchlist.json
pnpm eval
pnpm dev                     # web :5173 + api :4000
```

Vite proxies `/api` to port 4000.

## Environment

| Variable | Required for |
| --- | --- |
| `DATABASE_URL` | API, ingest, evals, `db:push` (default host port **55432**) |
| `SEC_USER_AGENT` | Ingest (SEC fair access: e.g. `FilingDesk you@email.com`) |
| `OPENAI_API_KEY` | Chat agent, `pnpm embed`, evals |
| `PORT` | API listen port (default `4000`) |

## SEC fair access

- Always send `User-Agent: $SEC_USER_AGENT`.
- Cap at under 10 requests per second (ingest client sleeps between calls).
- Cache everything. Reruns skip accessions that already have documents.

## Answer and tool rules

Agent tools: `resolveCompany`, `getFacts`, `searchFilings`, `readSection`, `compareFacts`, `diffSections`. All Zod-validated. All hit Postgres.

UI read routes (no model): company search, research brief, financial strip, filing lists, filings search, filing/section/document bodies, section matrix, eval results. Strip metrics come from `facts`.

Primary UX: Research brief → evidence → optional peers / filing changes. Supporting: Filings search → document view; Section matrix.

## After each milestone

Update [docs/status.md](docs/status.md). Update package READMEs when you add scripts or routes. Keep this file accurate if commands or package boundaries change.
