# Filing Desk

Filing Desk answers questions about public companies from their own SEC filings. Figures come from XBRL facts. Narrative answers quote the filing and link back to EDGAR.

This repository is the boilerplate: a pnpm workspace, a React app, an Express API, and the Postgres schema. Ingest, retrieval, the agent, and the eval runner are not built yet.

## Workspace

```text
apps/web          React, Vite, TypeScript, Ant Design
apps/api          Express, TypeScript
packages/db       Drizzle schema and Postgres client
docker-compose.yml  Postgres 17 with pgvector
```

Package names are `@filing-desk/web`, `@filing-desk/api`, and `@filing-desk/db`.

## Stack

| Piece | Choice |
| --- | --- |
| UI | React 19, Vite, Ant Design 6 |
| API | Express 5 |
| Language | TypeScript |
| Database | PostgreSQL 17, pgvector, Drizzle |
| Package manager | pnpm workspaces |

The web dev server proxies `/api` to the API on port 4000.

## Requirements

- Node.js 22 or newer
- pnpm 10
- Docker, for Postgres

## Setup

From the repository root:

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:push
pnpm dev
```

`pnpm dev` starts the web app and the API together. The app is at http://localhost:5173. The API is at http://localhost:4000.

Open the app and the header tag should read `filing-desk-api`. That tag is the health check. If it is red, the API is not running.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Web app and API |
| `pnpm dev:web` | Web app only |
| `pnpm dev:api` | API only |
| `pnpm build` | Build packages that define a build script |
| `pnpm db:push` | Push the Drizzle schema to the database in `DATABASE_URL` |

## Environment

Copy `.env.example` to `.env`. Do not commit `.env`.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Default in the example matches `docker-compose.yml`. |
| `SEC_USER_AGENT` | Descriptive user agent required by the SEC fair-access policy. Set this before any EDGAR client is added. |
| `OPENAI_API_KEY` | Chat model and embeddings. Unused by the boilerplate. |
| `PORT` | API port. Defaults to `4000`. |

## Database

`packages/db` owns the schema. `pnpm db:push` creates the tables. The client is `createDb(url)` from `@filing-desk/db`.

| Table | Holds |
| --- | --- |
| `companies` | Ticker, 10-digit CIK, name, SIC |
| `filings` | Form, dates, accession number, EDGAR URL |
| `documents` | Raw text of a primary filing or exhibit |
| `sections` | Business, Risk Factors, MD&A, and other item text |
| `chunks` | Passages for retrieval, with a 1536-dimension vector |
| `facts` | Consolidated XBRL values, one row per filed fact |
| `messages` | Chat turns for a conversation |
| `traces` | Agent steps: tool name, input, output |
| `eval_cases` | Frozen questions and expected answers |
| `eval_runs` | Score for one case: pass or fail, answer, detail |

`chunks.embedding` uses pgvector and an HNSW index with cosine distance. Facts are unique on `fact_key`. Filings are unique on `accession_number`.

## What the app will do

The shell in `apps/web` names the four jobs. None of them query filings yet.

- **Company.** Search a ticker, show a financial strip from `facts`, and answer a question with citations and a trace.
- **Compare.** Up to four filers. Metrics keep each company’s own period end. Narrative claims are cited per company.
- **Changes.** Two filings and one section, with quotes for added, removed, and reworded text.
- **Evals.** Run the frozen questions and score numeric match plus quote support.

EDGAR access, when it is added, goes through the SEC’s JSON feeds and the filing files those feeds point to. The client must send `SEC_USER_AGENT` and stay under the SEC request rate. Questions read the local database, not EDGAR.

## Packages

- [apps/web](apps/web/README.md)
- [apps/api](apps/api/README.md)
- [packages/db](packages/db/README.md)
