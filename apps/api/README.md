# @filing-desk/api

Express 5 API in TypeScript. `tsx` runs it in development. `tsc` compiles it to `dist` for `pnpm start`.

## Routes

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/api/health` | `{ "ok": true, "service": "filing-desk-api" }` |

CORS is enabled so a browser on another origin can call the API. The Vite app does not need that for local development, because `/api` is proxied.

The listen port is `PORT`, or `4000` when `PORT` is unset.

```bash
pnpm --filter @filing-desk/api dev
pnpm --filter @filing-desk/api build
pnpm --filter @filing-desk/api start
```

See the [root README](../../README.md) for the workspace setup.
