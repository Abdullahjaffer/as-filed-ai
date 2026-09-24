# @filing-desk/web

React 19 + Vite + TypeScript + Ant Design 6 + Ant Design X.

Screens: **Research brief** (primary), Peer metrics, Filing changes, Evals.

Research brief is the core flow: open a filer → XBRL scorecard → analyst prompts / chat → evidence + traces → deep-link to peer compare or risk-factor diff.

Vite proxies `/api` → `http://localhost:4000`.

```bash
pnpm --filter @filing-desk/web dev
```
