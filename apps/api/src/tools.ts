import {
  chunks,
  companies,
  facts,
  filings,
  sections,
} from "@filing-desk/db";
import { and, cosineDistance, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import OpenAI from "openai";

async function embedQuery(query: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return null;
  }
  const client = new OpenAI({ apiKey: key });
  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  return response.data[0]?.embedding ?? null;
}

function diffLines(a: string, b: string) {
  const aLines = new Set(
    a
      .split(/(?<=\.)\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 40),
  );
  const bLines = new Set(
    b
      .split(/(?<=\.)\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 40),
  );
  const added: string[] = [];
  const removed: string[] = [];
  for (const line of bLines) {
    if (![...aLines].some((x) => x.slice(0, 80) === line.slice(0, 80))) {
      added.push(line.slice(0, 500));
    }
  }
  for (const line of aLines) {
    if (![...bLines].some((x) => x.slice(0, 80) === line.slice(0, 80))) {
      removed.push(line.slice(0, 500));
    }
  }
  return {
    added: added.slice(0, 12),
    removed: removed.slice(0, 12),
  };
}

export const toolSchemas = {
  resolveCompany: z.object({
    query: z.string().describe("Ticker or company name fragment"),
  }),
  getFacts: z.object({
    ticker: z.string(),
    concepts: z
      .array(z.string())
      .describe("us-gaap concept names, e.g. Revenues, NetIncomeLoss"),
    limit: z.number().int().min(1).max(40).optional(),
  }),
  searchFilings: z.object({
    ticker: z.string(),
    query: z.string(),
    form: z.string().optional(),
    limit: z.number().int().min(1).max(12).optional(),
  }),
  readSection: z.object({
    ticker: z.string(),
    accessionNumber: z.string().optional(),
    item: z.string().describe("e.g. 1A, 7, 1, 8K"),
  }),
  compareFacts: z.object({
    tickers: z.array(z.string()).min(2).max(4),
    concept: z.string(),
    limitPerCompany: z.number().int().min(1).max(12).optional(),
  }),
  diffSections: z.object({
    ticker: z.string(),
    item: z.string(),
    olderAccession: z.string(),
    newerAccession: z.string(),
  }),
};

export async function resolveCompany(input: z.infer<typeof toolSchemas.resolveCompany>) {
  const q = `%${input.query}%`;
  const rows = await db
    .select({
      ticker: companies.ticker,
      name: companies.name,
      cik: companies.cik,
    })
    .from(companies)
    .where(or(ilike(companies.ticker, q), ilike(companies.name, q)))
    .limit(8);
  return { companies: rows };
}

export async function getFacts(input: z.infer<typeof toolSchemas.getFacts>) {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.ticker, input.ticker.toUpperCase()))
    .limit(1);
  if (!company) {
    return { error: `Unknown ticker ${input.ticker}` };
  }
  const limit = input.limit ?? 12;
  const rows = await db
    .select({
      concept: facts.concept,
      label: facts.label,
      unit: facts.unit,
      value: facts.value,
      endDate: facts.endDate,
      startDate: facts.startDate,
      form: facts.form,
      fiscalYear: facts.fiscalYear,
      fiscalPeriod: facts.fiscalPeriod,
      accessionNumber: facts.accessionNumber,
      filed: facts.filed,
    })
    .from(facts)
    .where(
      and(
        eq(facts.companyId, company.id),
        inArray(facts.concept, input.concepts),
      ),
    )
    .orderBy(desc(facts.endDate))
    .limit(limit * Math.max(input.concepts.length, 1));

  return { ticker: company.ticker, facts: rows };
}

export async function searchFilings(
  input: z.infer<typeof toolSchemas.searchFilings>,
) {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.ticker, input.ticker.toUpperCase()))
    .limit(1);
  if (!company) {
    return { error: `Unknown ticker ${input.ticker}` };
  }
  const limit = input.limit ?? 6;
  const embedding = await embedQuery(input.query);

  if (embedding) {
    const similarity = sql<number>`1 - (${cosineDistance(chunks.embedding, embedding)})`;
    const rows = await db
      .select({
        chunkId: chunks.id,
        content: chunks.content,
        similarity,
        accessionNumber: filings.accessionNumber,
        form: filings.form,
        filingDate: filings.filingDate,
        filingUrl: filings.filingUrl,
        item: sections.item,
        title: sections.title,
      })
      .from(chunks)
      .innerJoin(filings, eq(chunks.filingId, filings.id))
      .innerJoin(sections, eq(chunks.sectionId, sections.id))
      .where(
        and(
          eq(chunks.companyId, company.id),
          input.form ? eq(filings.form, input.form) : undefined,
        ),
      )
      .orderBy((t) => desc(t.similarity))
      .limit(limit);
    return { ticker: company.ticker, results: rows };
  }

  const rows = await db
    .select({
      chunkId: chunks.id,
      content: chunks.content,
      accessionNumber: filings.accessionNumber,
      form: filings.form,
      filingDate: filings.filingDate,
      filingUrl: filings.filingUrl,
      item: sections.item,
      title: sections.title,
    })
    .from(chunks)
    .innerJoin(filings, eq(chunks.filingId, filings.id))
    .innerJoin(sections, eq(chunks.sectionId, sections.id))
    .where(
      and(
        eq(chunks.companyId, company.id),
        sql`to_tsvector('english', ${chunks.content}) @@ plainto_tsquery('english', ${input.query})`,
        input.form ? eq(filings.form, input.form) : undefined,
      ),
    )
    .limit(limit);
  return { ticker: company.ticker, results: rows };
}

export async function readSection(input: z.infer<typeof toolSchemas.readSection>) {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.ticker, input.ticker.toUpperCase()))
    .limit(1);
  if (!company) {
    return { error: `Unknown ticker ${input.ticker}` };
  }

  const rows = await db
    .select({
      item: sections.item,
      title: sections.title,
      body: sections.body,
      accessionNumber: filings.accessionNumber,
      form: filings.form,
      filingDate: filings.filingDate,
      filingUrl: filings.filingUrl,
    })
    .from(sections)
    .innerJoin(filings, eq(sections.filingId, filings.id))
    .where(
      and(
        eq(sections.companyId, company.id),
        eq(sections.item, input.item),
        input.accessionNumber
          ? eq(filings.accessionNumber, input.accessionNumber)
          : undefined,
      ),
    )
    .orderBy(desc(filings.filingDate))
    .limit(1);

  if (rows.length === 0) {
    return { error: "Section not found" };
  }
  const row = rows[0];
  return {
    ...row,
    body: row.body.slice(0, 12_000),
  };
}

export async function compareFacts(
  input: z.infer<typeof toolSchemas.compareFacts>,
) {
  const limit = input.limitPerCompany ?? 6;
  const out: Record<string, unknown[]> = {};
  for (const ticker of input.tickers) {
    const result = await getFacts({
      ticker,
      concepts: [input.concept],
      limit,
    });
    out[ticker.toUpperCase()] =
      "facts" in result ? (result.facts as unknown[]) : [result];
  }
  return { concept: input.concept, byTicker: out };
}

export async function diffSections(
  input: z.infer<typeof toolSchemas.diffSections>,
) {
  const older = await readSection({
    ticker: input.ticker,
    item: input.item,
    accessionNumber: input.olderAccession,
  });
  const newer = await readSection({
    ticker: input.ticker,
    item: input.item,
    accessionNumber: input.newerAccession,
  });
  if ("error" in older || "error" in newer) {
    return { older, newer };
  }
  const { added, removed } = diffLines(older.body, newer.body);
  return {
    ticker: input.ticker.toUpperCase(),
    item: input.item,
    older: {
      accessionNumber: older.accessionNumber,
      filingDate: older.filingDate,
      filingUrl: older.filingUrl,
    },
    newer: {
      accessionNumber: newer.accessionNumber,
      filingDate: newer.filingDate,
      filingUrl: newer.filingUrl,
    },
    added,
    removed,
  };
}
