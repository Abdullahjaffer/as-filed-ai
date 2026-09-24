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
      ),
    )
    .orderBy(desc(filings.filingDate))
    .limit(100);
  res.json({ ticker, filings: rows });
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
