# @filing-desk/api

Express 5 API in TypeScript. Loads `.env` from the repo root. Talks to Postgres via `@filing-desk/db`. The chat agent uses the Vercel AI SDK (`ai` + `@ai-sdk/openai`).

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | `{ ok, service }` |
| `GET` | `/api/companies?q=` | Search tickers / names |
| `GET` | `/api/companies/:ticker/brief` | Research dossier: metrics, latest forms, prompts, peers, risk-diff accessions |
| `GET` | `/api/companies/:ticker/facts/strip` | Revenue, operating income, net income, diluted EPS series |
| `GET` | `/api/companies/:ticker/filings` | Filing list (`?form=10-K` optional) |
| `POST` | `/api/diff` | Section diff (`ticker`, `item`, `olderAccession`, `newerAccession`) |
| `POST` | `/api/chat` | Streaming tool-using agent (UI message stream) |
| `GET` | `/api/conversations/:id/traces` | Tool steps for a conversation |
| `GET` | `/api/evals` | Latest eval cases and runs |

Chat requires `OPENAI_API_KEY`. Tools: `resolveCompany`, `getFacts`, `searchFilings`, `readSection`, `compareFacts`, `diffSections`.

```bash
pnpm --filter @filing-desk/api dev
```

See [AGENTS.md](../../AGENTS.md) and [docs/architecture.md](../../docs/architecture.md).
