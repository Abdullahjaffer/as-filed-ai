import {
  companies,
  createDb,
  evalCases,
  evalRuns,
  facts,
  filings,
  sections,
} from "@filing-desk/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDatabaseUrl } from "./env.ts";

type Expected =
  | {
      type: "fact";
      concept?: string;
      concepts?: string[];
      formContains?: string;
    }
  | { type: "quote"; item: string; minQuoteLength?: number }
  | { type: "presence"; form?: string; minFilings?: number };

type CaseFile = {
  ticker: string;
  question: string;
  expected: Expected;
};

async function main(): Promise<void> {
  const db = createDb(getDatabaseUrl());
  const here = dirname(fileURLToPath(import.meta.url));
  const cases = JSON.parse(
    readFileSync(resolve(here, "../eval-cases.json"), "utf8"),
  ) as CaseFile[];

  console.log(`Seeding ${cases.length} eval cases…`);
  await db.delete(evalRuns);
  await db.delete(evalCases);

  const inserted = await db
    .insert(evalCases)
    .values(
      cases.map((c) => ({
        ticker: c.ticker,
        question: c.question,
        expected: c.expected,
      })),
    )
    .returning();

  let passed = 0;
  for (const c of inserted) {
    const expected = c.expected as Expected;
    const result = await runCase(db, c.ticker, expected);
    await db.insert(evalRuns).values({
      caseId: c.id,
      passed: result.passed,
      answer: result.answer,
      detail: result.detail,
    });
    console.log(`${result.passed ? "PASS" : "FAIL"} ${c.ticker}: ${c.question.slice(0, 60)}`);
    if (result.passed) {
      passed += 1;
    }
  }

  console.log(`\n${passed}/${inserted.length} passed`);
}

type Db = ReturnType<typeof createDb>;

async function runCase(
  db: Db,
  ticker: string,
  expected: Expected,
): Promise<{ passed: boolean; answer: string; detail: Record<string, unknown> }> {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.ticker, ticker.toUpperCase()))
    .limit(1);

  if (!company) {
    return {
      passed: false,
      answer: `Company ${ticker} not ingested`,
      detail: { reason: "missing_company" },
    };
  }

  if (expected.type === "fact") {
    const concepts =
      expected.concepts ?? (expected.concept ? [expected.concept] : []);
    const rows = await db
      .select()
      .from(facts)
      .where(and(eq(facts.companyId, company.id), inArray(facts.concept, concepts)))
      .orderBy(desc(facts.endDate))
      .limit(20);
    const filtered = expected.formContains
      ? rows.filter((r) => (r.form ?? "").includes(expected.formContains!))
      : rows;
    const hit = filtered[0] ?? rows[0];
    if (!hit) {
      return {
        passed: false,
        answer: "No matching XBRL fact",
        detail: { concepts },
      };
    }
    return {
      passed: true,
      answer: `${hit.concept}=${hit.value} ${hit.unit} end=${hit.endDate} form=${hit.form}`,
      detail: { fact: hit },
    };
  }

  if (expected.type === "quote") {
    const rows = await db
      .select({
        body: sections.body,
        item: sections.item,
        accessionNumber: filings.accessionNumber,
        form: filings.form,
      })
      .from(sections)
      .innerJoin(filings, eq(sections.filingId, filings.id))
      .where(and(eq(sections.companyId, company.id), eq(sections.item, expected.item)))
      .orderBy(desc(filings.filingDate))
      .limit(1);
    const row = rows[0];
    const min = expected.minQuoteLength ?? 40;
    if (!row || row.body.length < min) {
      return {
        passed: false,
        answer: "Section missing or too short",
        detail: { item: expected.item },
      };
    }
    const quote = row.body.slice(0, 240);
    return {
      passed: true,
      answer: quote,
      detail: {
        item: row.item,
        accessionNumber: row.accessionNumber,
        form: row.form,
      },
    };
  }

  const filingRows = await db
    .select()
    .from(filings)
    .where(
      and(
        eq(filings.companyId, company.id),
        expected.form ? eq(filings.form, expected.form) : undefined,
      ),
    )
    .limit(5);
  const minFilings = expected.minFilings ?? 1;
  const ok = filingRows.length >= minFilings;
  return {
    passed: ok,
    answer: `${filingRows.length} filings`,
    detail: { count: filingRows.length, minFilings },
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
