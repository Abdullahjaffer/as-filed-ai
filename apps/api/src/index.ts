/** HTTP API for Filing Desk. The web app proxies `/api` here in development. */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env") });

import cors from "cors";
import express from "express";
import { chatHandler } from "./chat";
import {
  getCompany,
  getFactStrip,
  getResearchBrief,
  listEvals,
  listFilings,
  listTraces,
  searchCompanies,
} from "./routes";
import { diffSections } from "./tools";

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "filing-desk-api" });
});

app.get("/api/companies", searchCompanies);
app.get("/api/companies/:ticker", getCompany);
app.get("/api/companies/:ticker/brief", getResearchBrief);
app.get("/api/companies/:ticker/facts/strip", getFactStrip);
app.get("/api/companies/:ticker/filings", listFilings);
app.get("/api/evals", listEvals);
app.get("/api/conversations/:conversationId/traces", listTraces);
app.post("/api/diff", async (req, res) => {
  try {
    const body = req.body as {
      ticker?: string;
      item?: string;
      olderAccession?: string;
      newerAccession?: string;
    };
    if (
      !body.ticker ||
      !body.item ||
      !body.olderAccession ||
      !body.newerAccession
    ) {
      res.status(400).json({
        error: "ticker, item, olderAccession, newerAccession required",
      });
      return;
    }
    const result = await diffSections({
      ticker: body.ticker,
      item: body.item,
      olderAccession: body.olderAccession,
      newerAccession: body.newerAccession,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "diff failed",
    });
  }
});
app.post("/api/chat", (req, res) => {
  void chatHandler(req, res);
});

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  console.log(`api listening on ${port}`);
});
