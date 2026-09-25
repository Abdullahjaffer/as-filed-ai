# @filing-desk/web

React 19 + Vite + TypeScript + Ant Design 6 + Ant Design X.

Screens are React Router routes, lazy-loaded per screen. Header: **Research brief** (`/`), **View filings** (`/filings`), **Matrix** (`/matrix`). Supporting: document (`/filings/:accession`), compare (`/compare`), peer metrics (`/peers`), filing changes (`/changes`), evals (`/evals`).

Research brief is the core flow: open a filer → XBRL scorecard → analyst prompts / chat → evidence + traces → deep-link to peer compare or risk-factor diff.

Vite proxies `/api` → `http://localhost:4000`.

```bash
pnpm --filter @filing-desk/web dev
```
