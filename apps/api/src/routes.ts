import {
  companies,
  evalCases,
  evalRuns,
  facts,
  filings,
  traces,
} from "@filing-desk/db";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Request, Response } from "express";
import { db } from "./db";

const STRIP_CONCEPTS = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "SalesRevenueNet",
  "OperatingIncomeLoss",
  "NetIncomeLoss",
  "EarningsPerShareDiluted",
];


export async function searchCompanies(req: Request, res: Response): Promise<void> {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    const rows = await db
      .select({
        ticker: companies.ticker,
        name: companies.name,
        cik: companies.cik,
      })
      .from(companies)
      .orderBy(companies.ticker)
      .limit(40);
    res.json({ companies: rows });
    return;
  }
  const pattern = `%${q}%`;
  const rows = await db
    .select({
      ticker: companies.ticker,
      name: companies.name,
      cik: companies.cik,
    })
    .from(companies)
    .where(or(ilike(companies.ticker, pattern), ilike(companies.name, pattern)))
    .limit(20);
  res.json({ companies: rows });
}

export async function getCompany(req: Request, res: Response): Promise<void> {
  const ticker = String(req.params.ticker).toUpperCase();
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.ticker, ticker))
    .limit(1);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  const filingCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(filings)
    .where(eq(filings.companyId, company.id));
  res.json({
    company: {
      ticker: company.ticker,
      name: company.name,
      cik: company.cik,
      sic: company.sic,
      sicDescription: company.sicDescription,
      filingCount: filingCount[0]?.count ?? 0,
    },
  });
}

export async function getResearchBrief(req: Request, res: Response): Promise<void> {
  const ticker = String(req.params.ticker).toUpperCase();
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.ticker, ticker))
    .limit(1);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  const allFilings = await db
    .select({
      accessionNumber: filings.accessionNumber,
      form: filings.form,
      filingDate: filings.filingDate,
      reportDate: filings.reportDate,
      filingUrl: filings.filingUrl,
      primaryDocument: filings.primaryDocument,
    })
    .from(filings)
    .where(eq(filings.companyId, company.id))
    .orderBy(desc(filings.filingDate));

  const tens = allFilings.filter((f) => f.form.startsWith("10-K"));
  const qs = allFilings.filter((f) => f.form.startsWith("10-Q"));
  const eights = allFilings.filter((f) => f.form.startsWith("8-K"));

  const factRows = await db
    .select({
      concept: facts.concept,
      label: facts.label,
      unit: facts.unit,
      value: facts.value,
      endDate: facts.endDate,
      form: facts.form,
      fiscalYear: facts.fiscalYear,
      fiscalPeriod: facts.fiscalPeriod,
      accessionNumber: facts.accessionNumber,
    })
    .from(facts)
    .where(
      and(
        eq(facts.companyId, company.id),
        inArray(facts.concept, STRIP_CONCEPTS),
      ),
    )
    .orderBy(desc(facts.endDate))
    .limit(2000);

  const pickAnnual = (concepts: string[]) =>
    factRows.find(
      (f) => concepts.includes(f.concept) && (f.form ?? "").includes("10-K"),
    ) ?? factRows.find((f) => concepts.includes(f.concept));

  const metrics = {
    revenue: pickAnnual([
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "SalesRevenueNet",
    ]),
    operatingIncome: pickAnnual(["OperatingIncomeLoss"]),
    netIncome: pickAnnual(["NetIncomeLoss"]),
    dilutedEps: pickAnnual(["EarningsPerShareDiluted"]),
  };

  const peers = await db
    .select({
      ticker: companies.ticker,
      name: companies.name,
      cik: companies.cik,
    })
    .from(companies)
    .where(sql`${companies.ticker} <> ${ticker}`)
    .orderBy(companies.ticker)
    .limit(8);

  const filingsByYear = groupFilingsByYear(allFilings);

  const annualTimeline = buildAnnualTimeline(factRows);

  res.json({
    company: {
      ticker: company.ticker,
      name: company.name,
      cik: company.cik,
      sic: company.sic,
      sicDescription: company.sicDescription,
      filingCount: allFilings.length,
    },
    metrics,
    annualTimeline,
    latest: {
      tenK: tens[0] ?? null,
      tenQ: qs[0] ?? null,
      eightK: eights[0] ?? null,
    },
    riskDiff: {
      newerAccession: tens[0]?.accessionNumber ?? null,
      olderAccession: tens[1]?.accessionNumber ?? null,
      item: "1A",
    },
    peers,
    filings: allFilings.slice(0, 80),
    filingsByYear,
    window: {
      years: null,
      since: allFilings.at(-1)?.filingDate ?? null,
      through: allFilings[0]?.filingDate ?? null,
      filingCount: allFilings.length,
    },
    prompts: [
      {
        key: "metrics",
        title: "Annual scorecard",
        prompt: `Using getFacts for ${ticker}, report the most recent annual Revenue (or RevenueFromContractWithCustomerExcludingAssessedTax), OperatingIncomeLoss, NetIncomeLoss, and EarningsPerShareDiluted. Cite form, period end, accession, and filingUrl for each figure.`,
      },
      {
        key: "risks",
        title: "Top risk themes",
        prompt: `For ${ticker}, use searchFilings and readSection on Item 1A. Summarize the three most material risk themes and quote a short passage for each with form, filing date, and filingUrl.`,
      },
      {
        key: "mda",
        title: "MD&A drivers",
        prompt: `For ${ticker}, read Item 7 (or Item 2 on a 10-Q if needed). What did management say drove results? Quote the filing and cite accession + filingUrl.`,
      },
      {
        key: "brief",
        title: "Full research brief",
        prompt: `Write a grounded equity research brief for ${ticker}. Cover: (1) latest annual XBRL scorecard via getFacts, (2) business snapshot from Item 1, (3) material risks from Item 1A with quotes, (4) one MD&A highlight. Every number from getFacts; every qualitative claim quoted. If unsupported, say the filing does not state it.`,
      },
    ],
  });
}


export async function getFactStrip(req: Request, res: Response): Promise<void> {
  const ticker = String(req.params.ticker).toUpperCase();
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.ticker, ticker))
    .limit(1);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  const rows = await db
    .select({
      concept: facts.concept,
      label: facts.label,
      unit: facts.unit,
      value: facts.value,
      endDate: facts.endDate,
      form: facts.form,
      fiscalYear: facts.fiscalYear,
      fiscalPeriod: facts.fiscalPeriod,
      accessionNumber: facts.accessionNumber,
    })
    .from(facts)
    .where(
      and(
        eq(facts.companyId, company.id),
        inArray(facts.concept, STRIP_CONCEPTS),
      ),
    )
    .orderBy(desc(facts.endDate))
    .limit(80);

  res.json({ ticker, facts: rows });
}

export async function listFilings(req: Request, res: Response): Promise<void> {
  const ticker = String(req.params.ticker).toUpperCase();
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.ticker, ticker))
    .limit(1);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  const form = req.query.form ? String(req.query.form) : undefined;
  const year = req.query.year ? String(req.query.year) : undefined;
  const rows = await db
    .select({
      accessionNumber: filings.accessionNumber,
      form: filings.form,
      filingDate: filings.filingDate,
      reportDate: filings.reportDate,
      filingUrl: filings.filingUrl,
      primaryDocument: filings.primaryDocument,
    })
    .from(filings)
    .where(
      and(
        eq(filings.companyId, company.id),
        form ? eq(filings.form, form) : undefined,
        year
          ? sql`extract(year from ${filings.filingDate}::date) = ${Number(year)}`
          : undefined,
      ),
    )
    .orderBy(desc(filings.filingDate));

  if (req.query.group === "year") {
    res.json({
      ticker,
      filingsByYear: groupFilingsByYear(rows),
    });
    return;
  }
  res.json({
    ticker,
    filings: rows,
  });
}

export async function listEvals(_req: Request, res: Response): Promise<void> {
  const cases = await db.select().from(evalCases).limit(100);
  const runs = await db
    .select({
      id: evalRuns.id,
      caseId: evalRuns.caseId,
      passed: evalRuns.passed,
      answer: evalRuns.answer,
      detail: evalRuns.detail,
      createdAt: evalRuns.createdAt,
      ticker: evalCases.ticker,
      question: evalCases.question,
    })
    .from(evalRuns)
    .innerJoin(evalCases, eq(evalRuns.caseId, evalCases.id))
    .orderBy(desc(evalRuns.createdAt))
    .limit(100);

  const passed = runs.filter((r) => r.passed).length;
  res.json({
    summary: {
      cases: cases.length,
      runs: runs.length,
      passed,
      failed: runs.length - passed,
    },
    cases,
    runs,
  });
}

export async function listTraces(req: Request, res: Response): Promise<void> {
  const conversationId = String(req.params.conversationId);
  const rows = await db
    .select()
    .from(traces)
    .where(eq(traces.conversationId, conversationId))
    .orderBy(traces.stepIndex);
  res.json({ conversationId, traces: rows });
}

type FilingListRow = {
  accessionNumber: string;
  form: string;
  filingDate: string;
  reportDate?: string | null;
  filingUrl: string;
  primaryDocument?: string | null;
};

type FactListRow = {
  concept: string;
  value: string;
  unit: string;
  endDate: string | null;
  form: string | null;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  accessionNumber?: string;
};

function groupFilingsByYear(rows: FilingListRow[]) {
  const map = new Map<
    string,
    {
      year: string;
      count: number;
      forms: Record<string, number>;
      filings: FilingListRow[];
    }
  >();
  for (const row of rows) {
    const year = (row.filingDate ?? "").slice(0, 4) || "unknown";
    const bucket = map.get(year) ?? {
      year,
      count: 0,
      forms: {},
      filings: [],
    };
    bucket.count += 1;
    const formKey = row.form.split("/")[0];
    bucket.forms[formKey] = (bucket.forms[formKey] ?? 0) + 1;
    bucket.filings.push(row);
    map.set(year, bucket);
  }
  return [...map.values()].sort((a, b) => b.year.localeCompare(a.year));
}

function buildAnnualTimeline(factRows: FactListRow[]) {
  const byYear = new Map<
    number,
    {
      year: number;
      revenue?: FactListRow;
      operatingIncome?: FactListRow;
      netIncome?: FactListRow;
      dilutedEps?: FactListRow;
    }
  >();

  const consider = (
    concepts: string[],
    field: "revenue" | "operatingIncome" | "netIncome" | "dilutedEps",
  ) => {
    for (const row of factRows) {
      if (!concepts.includes(row.concept)) {
        continue;
      }
      if (!(row.form ?? "").includes("10-K") && row.fiscalPeriod !== "FY") {
        continue;
      }
      const year =
        row.fiscalYear ??
        (row.endDate ? Number(row.endDate.slice(0, 4)) : NaN);
      if (!Number.isFinite(year)) {
        continue;
      }
      const bucket = byYear.get(year) ?? { year };
      if (!bucket[field]) {
        bucket[field] = row;
        byYear.set(year, bucket);
      }
    }
  };

  consider(
    [
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "SalesRevenueNet",
    ],
    "revenue",
  );
  consider(["OperatingIncomeLoss"], "operatingIncome");
  consider(["NetIncomeLoss"], "netIncome");
  consider(["EarningsPerShareDiluted"], "dilutedEps");

  return [...byYear.values()].sort((a, b) => b.year - a.year);
}

