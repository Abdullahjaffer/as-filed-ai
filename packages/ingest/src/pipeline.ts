import {
  companies,
  createDb,
  documents,
  facts,
  filings,
} from "@filing-desk/db";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDatabaseUrl, requireEnv } from "./env.ts";
import { keepDocument, sha256, splitSubmissionDocuments } from "./parse.ts";
import { replaceDocumentSections } from "./store-sections.ts";
import {
  SecClient,
  filingArchiveUrl,
  filingIndexUrl,
  padCik,
} from "./sec-client.ts";

type TickerMap = Record<string, { cik_str: number; ticker: string; title: string }>;

type SubmissionsPayload = {
  cik: string;
  name: string;
  sic?: string;
  sicDescription?: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
    };
    files?: Array<{ name: string; filingCount: number }>;
  };
};

type CompanyFactsPayload = {
  facts?: {
    "us-gaap"?: Record<
      string,
      {
        label?: string;
        units?: Record<
          string,
          Array<{
            end?: string;
            start?: string;
            val: number;
            accn: string;
            fy?: number;
            fp?: string;
            form?: string;
            filed?: string;
            frame?: string;
            segment?: unknown;
          }>
        >;
      }
    >;
  };
};

const ALLOWED_FORMS = new Set([
  "10-K",
  "10-K/A",
  "10-Q",
  "10-Q/A",
  "8-K",
  "8-K/A",
  "DEF 14A",
  "3",
  "4",
  "5",
  "3/A",
  "4/A",
  "5/A",
]);

function loadWatchlist(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, "../watchlist.json");
  return JSON.parse(readFileSync(path, "utf8")) as string[];
}

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

function shouldDownloadDocument(form: string, filingDate: string): boolean {
  if (form.startsWith("10-K") || form.startsWith("10-Q") || form.startsWith("DEF")) {
    return true;
  }
  if (form.startsWith("8-K")) {
    return new Date(filingDate) >= monthsAgo(24);
  }
  return false;
}

type FilingRow = typeof filings.$inferSelect;

/** Cap narrative downloads so a first ingest finishes in minutes. */
function pickDownloadTargets(all: FilingRow[]): FilingRow[] {
  const sorted = [...all].sort((a, b) =>
    a.filingDate < b.filingDate ? 1 : a.filingDate > b.filingDate ? -1 : 0,
  );
  const pick = (pred: (f: FilingRow) => boolean, n: number) =>
    sorted.filter(pred).slice(0, n);
  return [
    ...pick((f) => f.form.startsWith("10-K"), 4),
    ...pick((f) => f.form.startsWith("10-Q"), 8),
    ...pick((f) => f.form.startsWith("DEF"), 2),
    ...pick(
      (f) => f.form.startsWith("8-K") && shouldDownloadDocument(f.form, f.filingDate),
      20,
    ),
  ];
}

export async function ingestTickers(tickers: string[]): Promise<void> {
  const userAgent = requireEnv("SEC_USER_AGENT");
  const openaiKey = process.env.OPENAI_API_KEY;
  const db = createDb(getDatabaseUrl());
  const sec = new SecClient(userAgent);

  console.log("Loading company tickers…");
  const tickerMap = await sec.getJson<TickerMap>(
    "https://www.sec.gov/files/company_tickers.json",
  );
  const byTicker = new Map(
    Object.values(tickerMap).map((row) => [row.ticker.toUpperCase(), row]),
  );

  for (const raw of tickers) {
    const ticker = raw.toUpperCase();
    const row = byTicker.get(ticker);
    if (!row) {
      console.warn(`Unknown ticker ${ticker}, skipping`);
      continue;
    }
    console.log(`\n=== ${ticker} (${row.title}) ===`);
    await ingestOne(db, sec, ticker, row, openaiKey);
  }
}

type Db = ReturnType<typeof createDb>;

async function ingestOne(
  db: Db,
  sec: SecClient,
  ticker: string,
  row: { cik_str: number; ticker: string; title: string },
  openaiKey: string | undefined,
): Promise<void> {
  const cik = padCik(row.cik_str);
  const submissions = await sec.getJson<SubmissionsPayload>(
    `https://data.sec.gov/submissions/CIK${cik}.json`,
  );

  const [company] = await db
    .insert(companies)
    .values({
      cik,
      ticker,
      name: submissions.name || row.title,
      sic: submissions.sic ?? null,
      sicDescription: submissions.sicDescription ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: companies.ticker,
      set: {
        cik,
        name: submissions.name || row.title,
        sic: submissions.sic ?? null,
        sicDescription: submissions.sicDescription ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  const filingRows = collectFilings(submissions);
  for (const file of submissions.filings.files ?? []) {
    if (!file.name.endsWith(".json")) {
      continue;
    }
    const extra = await sec.getJson<{
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
    }>(`https://data.sec.gov/submissions/${file.name}`);
    filingRows.push(...collectFilingsFromArrays(extra));
  }

  console.log(`Upserting ${filingRows.length} filings…`);
  const batchSize = 200;
  for (let i = 0; i < filingRows.length; i += batchSize) {
    const slice = filingRows.slice(i, i + batchSize);
    await db
      .insert(filings)
      .values(
        slice.map((f) => ({
          companyId: company.id,
          accessionNumber: f.accessionNumber,
          form: f.form,
          filingDate: f.filingDate,
          reportDate: f.reportDate || null,
          primaryDocument: f.primaryDocument || null,
          filingUrl: filingIndexUrl(cik, f.accessionNumber),
        })),
      )
      .onConflictDoNothing({ target: filings.accessionNumber });
  }

  console.log("Loading company facts…");
  const companyFacts = await sec.getJson<CompanyFactsPayload>(
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
  );
  await upsertFacts(db, company.id, companyFacts);

  const stored = await db
    .select()
    .from(filings)
    .where(eq(filings.companyId, company.id));

  const downloadTargets = pickDownloadTargets(stored);
  console.log(`Downloading ${downloadTargets.length} documents…`);

  for (const filing of downloadTargets) {
    const existingDocs = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.filingId, filing.id))
      .limit(1);
    if (existingDocs.length > 0) {
      continue;
    }

    console.log(`Downloading ${filing.form} ${filing.accessionNumber}…`);
    const url = filingArchiveUrl(cik, filing.accessionNumber);
    let raw: string;
    try {
      raw = await sec.getText(url);
    } catch (error) {
      console.warn(`Failed ${url}:`, error instanceof Error ? error.message : error);
      continue;
    }

    const docs = splitSubmissionDocuments(raw).filter((d) =>
      keepDocument(d, filing.form),
    );
    if (docs.length === 0) {
      continue;
    }

    for (const doc of docs) {
      const kind = doc.type.toUpperCase().startsWith("EX-99")
        ? "exhibit"
        : "primary";
      const [inserted] = await db
        .insert(documents)
        .values({
          filingId: filing.id,
          kind,
          filename: doc.filename,
          documentType: doc.type,
          sourceUrl: url,
          content: doc.text,
          sha256: sha256(doc.text),
        })
        .returning();

      await replaceDocumentSections(db, {
        documentId: inserted.id,
        filingId: filing.id,
        companyId: company.id,
        form: filing.form,
        kind,
        html: doc.text,
      });
    }
  }

  if (!openaiKey) {
    console.warn("OPENAI_API_KEY unset; chat and pnpm embed need it. Ingest stores chunks without embeddings.");
  }
}

function collectFilings(payload: SubmissionsPayload) {
  return collectFilingsFromArrays(payload.filings.recent);
}

function collectFilingsFromArrays(recent: {
  accessionNumber: string[];
  filingDate: string[];
  reportDate?: string[];
  form: string[];
  primaryDocument?: string[];
}) {
  const out: Array<{
    accessionNumber: string;
    form: string;
    filingDate: string;
    reportDate: string;
    primaryDocument: string;
  }> = [];
  for (let i = 0; i < recent.accessionNumber.length; i++) {
    const form = recent.form[i];
    if (!ALLOWED_FORMS.has(form)) {
      continue;
    }
    out.push({
      accessionNumber: recent.accessionNumber[i],
      form,
      filingDate: recent.filingDate[i],
      reportDate: recent.reportDate?.[i] ?? "",
      primaryDocument: recent.primaryDocument?.[i] ?? "",
    });
  }
  return out;
}

async function upsertFacts(
  db: Db,
  companyId: string,
  payload: CompanyFactsPayload,
): Promise<void> {
  const gaap = payload.facts?.["us-gaap"] ?? {};
  const values: Array<typeof facts.$inferInsert> = [];
  for (const [concept, conceptData] of Object.entries(gaap)) {
    for (const [unit, rows] of Object.entries(conceptData.units ?? {})) {
      for (const row of rows) {
        if (row.segment !== undefined) {
          continue;
        }
        const factKey = [
          companyId,
          concept,
          unit,
          row.accn,
          row.end ?? "",
          row.start ?? "",
          row.frame ?? "",
        ].join("|");
        values.push({
          companyId,
          factKey,
          accessionNumber: row.accn,
          taxonomy: "us-gaap",
          concept,
          label: conceptData.label ?? null,
          unit,
          value: String(row.val),
          startDate: row.start ?? null,
          endDate: row.end ?? null,
          form: row.form ?? null,
          fiscalYear: row.fy ?? null,
          fiscalPeriod: row.fp ?? null,
          filed: row.filed ?? null,
        });
      }
    }
  }
  const batchSize = 300;
  for (let i = 0; i < values.length; i += batchSize) {
    await db
      .insert(facts)
      .values(values.slice(i, i + batchSize))
      .onConflictDoNothing({ target: facts.factKey });
  }
  console.log(`Upserted up to ${values.length} consolidated us-gaap facts`);
}

export function resolveTickers(argv: string[]): string[] {
  const args = argv.filter((a) => !a.startsWith("-"));
  if (args.length === 0) {
    return loadWatchlist();
  }
  return args;
}
