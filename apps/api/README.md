# @filing-desk/api

Express 5 API in TypeScript. Loads `.env` from the repo root. Talks to Postgres via `@filing-desk/db`. The chat agent uses the Vercel AI SDK (`ai` + `@ai-sdk/openai`).

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | `{ ok, service }` |
| `GET` | `/api/companies?q=` | Search tickers / names |
| `GET` | `/api/companies/:ticker/brief` | Research dossier: metrics, annual timeline, filings-by-year, prompts, peers |
| `GET` | `/api/companies/:ticker/filings` | Filing list (`?form=`, `?year=2024`, `?group=year`) |
| `GET` | `/api/search` | Filing index or keyword/section search (`ticker`, `form`, `year`, `item`, `q`) |
| `GET` | `/api/filings/:accession` | Filing meta + section tree and document list (no bodies) |
| `GET` | `/api/sections/:id` | Stored section body |
| `GET` | `/api/documents/:id` | Stored document/exhibit text |
| `GET` | `/api/matrix` | Latest section snippet per ticker (`item`, `tickers`, optional `year`) |
| `GET` | `/api/matrix/by-accessions` | Same-company grid: all sections × filings (`accessions`) |
| `GET` | `/api/companies/:ticker/section-filings` | Filings that have stored sections (`form`, `year`, `item`, `q`) |
| `POST` | `/api/diff` | Section diff (`ticker`, `item`, `olderAccession`, `newerAccession`) |
| `POST` | `/api/chat` | Streaming tool-using agent (UI message stream) |
| `GET` | `/api/conversations/:id/traces` | Tool steps for a conversation |
| `GET` | `/api/evals` | Latest eval cases and runs |

Chat requires `OPENAI_API_KEY`. Tools: `resolveCompany`, `getFacts`, `searchFilings`, `readSection`, `compareFacts`, `diffSections`.

```bash
pnpm --filter @filing-desk/api dev
```

See [AGENTS.md](../../AGENTS.md) and [docs/architecture.md](../../docs/architecture.md).
