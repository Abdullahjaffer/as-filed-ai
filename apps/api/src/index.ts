/** HTTP API for Filing Desk. The web app proxies `/api` here in development. */
import cors from "cors";
import express from "express";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "filing-desk-api" });
});

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  console.log(`api listening on ${port}`);
});
