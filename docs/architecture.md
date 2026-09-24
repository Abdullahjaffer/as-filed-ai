# Architecture

Filing Desk is a research tool over primary SEC filings. Numbers come from XBRL company facts. Narrative answers come from retrieved filing sections with citations.

## Primary use case

**Grounded equity research brief.** An analyst opens one public company, reads an XBRL scorecard from filed facts, asks citation-backed questions about Business / Risk Factors / MD&A, inspects evidence, then optionally diffs year-over-year language or compares peer metrics.

That is the product spine. Peer compare and filing diffs are supporting flows entered from the brief.

```text
Open ticker → XBRL scorecard + latest forms
            → Analyst prompts / free-form ask
            → Evidence (facts + quotes) + tool trace
            → Diff risks  |  Compare peers
```

UI entry: **Research brief** (`apps/web`). API: `GET /api/companies/:ticker/brief` plus `POST /api/chat`.


```text
SEC JSON APIs + submission .txt
        │
        ▼
 packages/ingest  ──►  Postgres (companies, filings, documents,
                       sections, chunks+embeddings, facts)
        │
        ▼
 apps/api tools + read routes  ◄──  apps/web (Ant Design shell)
        │
        ▼
 streamText agent ──► traces + messages
```

Chat never calls EDGAR. Ingest is the only path that talks to `sec.gov` / `data.sec.gov`.

## SEC endpoints

| Purpose | URL |
| --- | --- |
| Ticker → CIK | `https://www.sec.gov/files/company_tickers.json` |
| Filing history | `https://data.sec.gov/submissions/CIK{10-digit-cik}.json` |
| Extra history pages | URLs listed in `filings.files` on the submissions payload |
| XBRL facts | `https://data.sec.gov/api/xbrl/companyfacts/CIK{10-digit-cik}.json` |
| Full submission | `https://www.sec.gov/Archives/edgar/data/{cikNoZeros}/{accessionNoDashes}/{accession}-index...` — prefer the `.txt` complete submission: `https://www.sec.gov/Archives/edgar/data/{cik}/{accessionNoDashes}/{accession}.txt` |

CIK in paths is zero-padded to 10 digits for JSON APIs. Archive paths use the CIK without leading zeros.

Header on every SEC request: `User-Agent: $SEC_USER_AGENT`, `Accept: application/json` for JSON.

## Ingest pipeline

Per ticker:

1. Resolve ticker → CIK and name from `company_tickers.json`.
2. Load submissions (and linked `filings.files` pages). Upsert `companies` and `filings` for forms `10-K`, `10-Q`, `8-K`, `DEF 14A`, `3`, `4`, `5` (and common variants like `10-K/A` treated by base form where noted in code).
3. Load companyfacts. Keep consolidated `us-gaap` facts only (skip facts with a `segment`). Upsert `facts` by unique `fact_key`.
4. For recent narrative filings (capped per ticker: 4×10-K, 8×10-Q, 2×DEF 14A, 20×8-K within 24 months): if documents are not already stored for that accession, download the complete submission `.txt`, split `<DOCUMENT>` blocks, keep the primary form document and `EX-99*` exhibits in `documents`.
5. Parse narrative into `sections` (Business, Risk Factors, MD&A for annual/quarterly; 8-K item text; proxy sections when detectable).
6. Chunk section bodies (~1500 chars, overlap), embed with OpenAI `text-embedding-3-small` (1536 dims) when `OPENAI_API_KEY` is set, write `chunks`. Forms 3/4/5 are indexed in `filings` only.

## Tables

See root README and `packages/db/src/schema.ts`. Roles:

- `companies` / `filings` — EDGAR index
- `documents` — raw filing / exhibit text
- `sections` — item-level narrative
- `chunks` — retrieval units + `vector(1536)` + full-text search
- `facts` — consolidated XBRL
- `messages` / `traces` — chat and tool steps
- `eval_cases` / `eval_runs` — frozen questions and scores

## Agent

`POST /api/chat` in `apps/api`:

- Body: `{ conversationId?, messages }` (AI SDK UI messages).
- `streamText` from the `ai` package with `@ai-sdk/openai`, `stopWhen: isStepCount(8)` (or similar).
- Tools (Zod): `resolveCompany`, `getFacts`, `searchFilings`, `readSection`, `compareFacts`, `diffSections`.
- `searchFilings`: hybrid — cosine distance on embeddings plus Postgres full-text on chunk content; filter by company and optional form.
- On each tool step, insert a `traces` row. Persist user/assistant turns to `messages`.
- Response: UI message stream suitable for the web client (`toUIMessageStream` / `pipeUIMessageStreamToResponse` patterns).

System prompt: use tools for every figure and quote; cite form, date, accession / EDGAR URL; refuse when unsupported.

## Read APIs (no LLM)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Liveness |
| GET | `/api/companies?q=` | Search ticker / name |
| GET | `/api/companies/:ticker` | Company dossier summary |
| GET | `/api/companies/:ticker/brief` | Research brief payload |
| GET | `/api/companies/:ticker/facts/strip` | Revenue, operating income, net income, diluted EPS series |
| GET | `/api/companies/:ticker/filings` | Filing list |
| GET | `/api/search` | Filing index or keyword/section search (`ticker`, `form`, `year`, `item`, `q`) |
| GET | `/api/filings/:accession` | Filing meta, section list, document list (no bodies) |
| GET | `/api/sections/:id` | Stored section body |
| GET | `/api/documents/:id` | Stored document/exhibit text |
| GET | `/api/matrix` | Latest section snippet per ticker for an item (optional `year`) |
| GET | `/api/matrix/by-accessions` | Same-company matrix: section snippets for listed accessions |
| GET | `/api/companies/:ticker/section-filings` | Filings with stored sections (matrix builder) |
| GET | `/api/evals` | Latest eval run summary |

## UI

Ant Design layout in `apps/web`. Ant Design X for chat bubbles, sender, and tool-trace display. Screens: Research brief, Filings (filters + results + document drawer), Section matrix, Peer metrics (≤4 tickers), Filing changes (two filings + section item), Evals.

## Evals

~30 cases in `packages/ingest` or `apps/api` data (checked in). Each case: ticker, question, `expected` JSON (numeric concept/period and/or required quote substring). `pnpm eval` runs the agent or the same tools, writes `eval_runs`. Pass = figures match `facts` and quotes appear in retrieved text.
