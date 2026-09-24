# @filing-desk/web

React 19 app built with Vite and TypeScript. UI components come from Ant Design 6.

`src/main.tsx` wraps the tree in `ConfigProvider` and Ant Design’s `App`. `src/App.tsx` is the shell: a sider for Overview, Company, Compare, Changes, and Evals, and a header tag that calls `GET /api/health`.

Vite proxies `/api` to `http://localhost:4000`, which is the Express API. Start both with `pnpm dev` from the repository root.

```bash
pnpm --filter @filing-desk/web dev
pnpm --filter @filing-desk/web build
pnpm --filter @filing-desk/web lint
```

The dev server is http://localhost:5173. See the [root README](../../README.md) for setup, environment variables, and the database.
