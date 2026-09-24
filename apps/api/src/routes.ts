import {
  chunks,
  companies,
  documents,
  evalCases,
  evalRuns,
  facts,
  filings,
  sections,
  traces,
} from "@filing-desk/db";
import { and, desc, eq, ilike, inArray, like, or, sql } from "drizzle-orm";
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

/**
 * Filings index search, or keyword/section search over stored chunks.
 * Keyword path uses Postgres full-text only (no embeddings).
 */
export async function searchFilingsCatalog(
  req: Request,
  res: Response,
): Promise<void> {
  const ticker = req.query.ticker
    ? String(req.query.ticker).trim().toUpperCase()
    : undefined;
  const form = req.query.form ? String(req.query.form).trim() : undefined;
  const year = req.query.year ? String(req.query.year).trim() : undefined;
  const item = req.query.item ? String(req.query.item).trim() : undefined;
  const q = req.query.q ? String(req.query.q).trim() : undefined;
  const textOnly = req.query.text === "1";
  const limit = 50;

  const yearFilter = year
    ? sql`extract(year from ${filings.filingDate}::date) = ${Number(year)}`
    : undefined;
  const tickerFilter = ticker ? eq(companies.ticker, ticker) : undefined;
  const formFilter = form
    ? form.includes("/")
      ? eq(filings.form, form)
      : or(eq(filings.form, form), like(filings.form, `${form}/%`))
    : undefined;
  const textFilter = textOnly
    ? sql`exists (select 1 from documents d where d.filing_id = ${filings.id})`
    : undefined;

  if (item && !q) {
    const rows = await db
      .select({
        ticker: companies.ticker,
        sic: companies.sic,
        sicDescription: companies.sicDescription,
        accessionNumber: filings.accessionNumber,
        form: filings.form,
        filingDate: filings.filingDate,
        filingUrl: filings.filingUrl,
        item: sections.item,
        title: sections.title,
        sectionId: sections.id,
        snippet: sql<string>`left(${sections.body}, 320)`,
      })
      .from(sections)
      .innerJoin(filings, eq(sections.filingId, filings.id))
      .innerJoin(companies, eq(sections.companyId, companies.id))
      .where(
        and(
          tickerFilter,
          formFilter,
          yearFilter,
          textFilter,
          eq(sections.level, 0),
          eq(sections.item, item),
        ),
      )
      .orderBy(desc(filings.filingDate))
      .limit(limit);

    res.json({
      mode: "section",
      results: rows.map((row) => ({
        ...row,
        chunkId: null,
        hasText: true,
      })),
    });
    return;
  }

  if (q) {
    const rank = q
      ? sql<number>`ts_rank(to_tsvector('english', ${chunks.content}), plainto_tsquery('english', ${q}))`
      : sql<number>`0`;
    const rows = await db
      .select({
        ticker: companies.ticker,
        sic: companies.sic,
        sicDescription: companies.sicDescription,
        accessionNumber: filings.accessionNumber,
        form: filings.form,
        filingDate: filings.filingDate,
        filingUrl: filings.filingUrl,
        item: sections.item,
        title: sections.title,
        sectionId: sections.id,
        snippet: chunks.content,
        chunkId: chunks.id,
        rank,
      })
      .from(chunks)
      .innerJoin(sections, eq(chunks.sectionId, sections.id))
      .innerJoin(filings, eq(chunks.filingId, filings.id))
      .innerJoin(companies, eq(chunks.companyId, companies.id))
      .where(
        and(
          tickerFilter,
          formFilter,
          yearFilter,
          textFilter,
          item ? eq(sections.item, item) : undefined,
          q
            ? sql`to_tsvector('english', ${chunks.content}) @@ plainto_tsquery('english', ${q})`
            : undefined,
        ),
      )
      .orderBy(desc(rank), desc(filings.filingDate))
      .limit(200);

    const seen = new Set<string>();
    const deduped = [];
    for (const row of rows) {
      const key = row.accessionNumber;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(row);
      if (deduped.length >= limit) {
        break;
      }
    }

    res.json({
      mode: "keyword",
      results: deduped.map(({ rank: _rank, ...row }) => ({
        ...row,
        snippet: row.snippet.slice(0, 320),
        hasText: true,
      })),
    });
    return;
  }

  const rows = await db
    .select({
      ticker: companies.ticker,
      sic: companies.sic,
      sicDescription: companies.sicDescription,
      accessionNumber: filings.accessionNumber,
      form: filings.form,
      filingDate: filings.filingDate,
      filingUrl: filings.filingUrl,
      reportDate: filings.reportDate,
      primaryDocument: filings.primaryDocument,
      hasText: sql<boolean>`exists (
        select 1 from documents d where d.filing_id = ${filings.id}
      )`,
    })
    .from(filings)
    .innerJoin(companies, eq(filings.companyId, companies.id))
    .where(and(tickerFilter, formFilter, yearFilter, textFilter))
    .orderBy(desc(filings.filingDate))
    .limit(limit);

  res.json({
    mode: "index",
    results: rows.map((row) => ({
      ...row,
      item: null,
      title: null,
      sectionId: null,
      snippet: null,
      chunkId: null,
    })),
  });
}

export async function getFilingDetail(
  req: Request,
  res: Response,
): Promise<void> {
  const accession = String(req.params.accession);
  const [row] = await db
    .select({
      id: filings.id,
      accessionNumber: filings.accessionNumber,
      form: filings.form,
      filingDate: filings.filingDate,
      reportDate: filings.reportDate,
      filingUrl: filings.filingUrl,
      primaryDocument: filings.primaryDocument,
      ticker: companies.ticker,
      name: companies.name,
      cik: companies.cik,
      sic: companies.sic,
      sicDescription: companies.sicDescription,
    })
    .from(filings)
    .innerJoin(companies, eq(filings.companyId, companies.id))
    .where(eq(filings.accessionNumber, accession))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Filing not found" });
    return;
  }

  const sectionRows = await db
    .select({
      id: sections.id,
      parentId: sections.parentId,
      ordinal: sections.ordinal,
      level: sections.level,
      item: sections.item,
      title: sections.title,
    })
    .from(sections)
    .where(eq(sections.filingId, row.id))
    .orderBy(sections.ordinal);

  const byParent = new Map<string | null, typeof sectionRows>();
  for (const section of sectionRows) {
    const key = section.parentId;
    const list = byParent.get(key) ?? [];
    list.push(section);
    byParent.set(key, list);
  }
  type SectionNode = {
    id: string;
    item: string;
    title: string;
    level: number;
    children: SectionNode[];
  };
  const toNode = (section: (typeof sectionRows)[number]): SectionNode => ({
    id: section.id,
    item: section.item,
    title: section.title,
    level: section.level,
    children: (byParent.get(section.id) ?? []).map(toNode),
  });
  const sectionTree = (byParent.get(null) ?? []).map(toNode);

  const documentRows = await db
    .select({
      id: documents.id,
      kind: documents.kind,
      documentType: documents.documentType,
      filename: documents.filename,
    })
    .from(documents)
    .where(eq(documents.filingId, row.id))
    .orderBy(documents.kind, documents.documentType);

  const { id: _filingId, ...filing } = row;
  res.json({
    filing,
    sections: sectionTree,
    documents: documentRows,
  });
}

export async function getSectionById(
  req: Request,
  res: Response,
): Promise<void> {
  const id = String(req.params.id);
  const [row] = await db
    .select({
      id: sections.id,
      item: sections.item,
      title: sections.title,
      body: sections.body,
      accessionNumber: filings.accessionNumber,
      form: filings.form,
      filingDate: filings.filingDate,
      filingUrl: filings.filingUrl,
      ticker: companies.ticker,
    })
    .from(sections)
    .innerJoin(filings, eq(sections.filingId, filings.id))
    .innerJoin(companies, eq(sections.companyId, companies.id))
    .where(eq(sections.id, id))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Section not found" });
    return;
  }
  res.json({ section: row });
}

export async function getDocumentById(
  req: Request,
  res: Response,
): Promise<void> {
  const id = String(req.params.id);
  const [row] = await db
    .select({
      id: documents.id,
      kind: documents.kind,
      documentType: documents.documentType,
      filename: documents.filename,
      content: documents.content,
      sourceUrl: documents.sourceUrl,
      accessionNumber: filings.accessionNumber,
      form: filings.form,
      filingDate: filings.filingDate,
      filingUrl: filings.filingUrl,
      ticker: companies.ticker,
    })
    .from(documents)
    .innerJoin(filings, eq(documents.filingId, filings.id))
    .innerJoin(companies, eq(filings.companyId, companies.id))
    .where(eq(documents.id, id))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json({ document: row });
}

/** Latest stored section of an item per ticker (optionally for a filing year). */
export async function getSectionMatrix(
  req: Request,
  res: Response,
): Promise<void> {
  const item = String(req.query.item ?? "1A").trim();
  const yearRaw = req.query.year ? String(req.query.year).trim() : undefined;
  const year = yearRaw ? Number(yearRaw) : undefined;
  const tickersRaw = req.query.tickers
    ? String(req.query.tickers)
    : "NVDA,AAPL,AMD,MSFT";
  const tickers = tickersRaw
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 8);

  if (tickers.length === 0) {
    res.status(400).json({ error: "tickers required" });
    return;
  }
  if (yearRaw && !Number.isFinite(year)) {
    res.status(400).json({ error: "year must be a number" });
    return;
  }

  const companyRows = await db
    .select({
      id: companies.id,
      ticker: companies.ticker,
      name: companies.name,
    })
    .from(companies)
    .where(inArray(companies.ticker, tickers));

  const byTicker = new Map(companyRows.map((c) => [c.ticker, c]));
  const cells: Array<{
    ticker: string;
    name: string | null;
    sectionId: string | null;
    accessionNumber: string | null;
    form: string | null;
    filingDate: string | null;
    filingUrl: string | null;
    title: string | null;
    snippet: string | null;
  }> = [];

  for (const ticker of tickers) {
    const company = byTicker.get(ticker);
    if (!company) {
      cells.push({
        ticker,
        name: null,
        sectionId: null,
        accessionNumber: null,
        form: null,
        filingDate: null,
        filingUrl: null,
        title: null,
        snippet: null,
      });
      continue;
    }

    const [section] = await db
      .select({
        id: sections.id,
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
          eq(sections.item, item),
          eq(sections.level, 0),
          year
            ? sql`extract(year from ${filings.filingDate}::date) = ${year}`
            : undefined,
        ),
      )
      .orderBy(desc(filings.filingDate))
      .limit(1);

    if (!section) {
      cells.push({
        ticker,
        name: company.name,
        sectionId: null,
        accessionNumber: null,
        form: null,
        filingDate: null,
        filingUrl: null,
        title: null,
        snippet: null,
      });
      continue;
    }

    cells.push({
      ticker,
      name: company.name,
      sectionId: section.id,
      accessionNumber: section.accessionNumber,
      form: section.form,
      filingDate: section.filingDate,
      filingUrl: section.filingUrl,
      title: section.title,
      snippet: section.body.slice(0, 400),
    });
  }

  res.json({ item, year: year ?? null, tickers, cells });
}

/**
 * Same-company matrix grid: columns = filings, rows = all section items
 * present on any of those filings.
 */
export async function getMatrixByAccessions(
  req: Request,
  res: Response,
): Promise<void> {
  const accessionsRaw = req.query.accessions
    ? String(req.query.accessions)
    : "";
  const accessions = accessionsRaw
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 12);

  if (accessions.length === 0) {
    res.status(400).json({ error: "accessions required" });
    return;
  }

  const columns: Array<{
    accessionNumber: string;
    form: string;
    filingDate: string;
    filingUrl: string;
    label: string;
    ticker: string;
    name: string;
    filingId: string;
  }> = [];

  for (const accession of accessions) {
    const [filing] = await db
      .select({
        filingId: filings.id,
        accessionNumber: filings.accessionNumber,
        form: filings.form,
        filingDate: filings.filingDate,
        filingUrl: filings.filingUrl,
        ticker: companies.ticker,
        name: companies.name,
      })
      .from(filings)
      .innerJoin(companies, eq(filings.companyId, companies.id))
      .where(eq(filings.accessionNumber, accession))
      .limit(1);

    if (!filing) {
      continue;
    }
    const year = (filing.filingDate ?? "").slice(0, 4);
    columns.push({
      ...filing,
      label: `${filing.ticker} ${year} ${filing.form}`,
    });
  }

  if (columns.length === 0) {
    res.status(404).json({ error: "No filings found for accessions" });
    return;
  }

  const filingIds = columns.map((c) => c.filingId);
  const sectionRows = await db
    .select({
      id: sections.id,
      item: sections.item,
      title: sections.title,
      body: sections.body,
      filingId: sections.filingId,
      accessionNumber: filings.accessionNumber,
    })
    .from(sections)
    .innerJoin(filings, eq(sections.filingId, filings.id))
    .where(and(inArray(sections.filingId, filingIds), eq(sections.level, 0)));

  const itemOrder = ["1", "1A", "2", "7", "8K", "PROXY"];
  const itemMeta = new Map<string, string>();
  for (const row of sectionRows) {
    if (!itemMeta.has(row.item)) {
      itemMeta.set(row.item, row.title);
    }
  }
  const rows = [...itemMeta.entries()]
    .map(([item, title]) => ({ item, title }))
    .sort((a, b) => {
      const ai = itemOrder.indexOf(a.item);
      const bi = itemOrder.indexOf(b.item);
      const ao = ai === -1 ? 99 : ai;
      const bo = bi === -1 ? 99 : bi;
      return ao - bo || a.item.localeCompare(b.item);
    });

  const cells: Record<
    string,
    {
      sectionId: string;
      title: string;
      snippet: string;
    }
  > = {};
  for (const row of sectionRows) {
    const key = `${row.item}|${row.accessionNumber}`;
    cells[key] = {
      sectionId: row.id,
      title: row.title,
      snippet: row.body.slice(0, 280),
    };
  }

  const tickers = [...new Set(columns.map((c) => c.ticker))];
  res.json({
    mode: "by-accessions",
    ticker: tickers[0],
    tickers,
    name: columns[0].name,
    columns: columns.map(({ filingId: _id, ...col }) => col),
    rows,
    cells,
  });
}

/** Filings for a ticker that have at least one stored section (for matrix builder). */
export async function listSectionFilings(
  req: Request,
  res: Response,
): Promise<void> {
  const ticker = String(req.params.ticker).toUpperCase();
  const form = req.query.form ? String(req.query.form).trim() : undefined;
  const year = req.query.year ? String(req.query.year).trim() : undefined;
  const item = req.query.item ? String(req.query.item).trim() : undefined;
  const q = req.query.q ? String(req.query.q).trim().toLowerCase() : undefined;

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
      accessionNumber: filings.accessionNumber,
      form: filings.form,
      filingDate: filings.filingDate,
      filingUrl: filings.filingUrl,
      items: sql<string>`string_agg(distinct ${sections.item}, ',' order by ${sections.item})`,
    })
    .from(filings)
    .innerJoin(sections, eq(sections.filingId, filings.id))
    .where(
      and(
        eq(filings.companyId, company.id),
        eq(sections.level, 0),
        form ? eq(filings.form, form) : undefined,
        year
          ? sql`extract(year from ${filings.filingDate}::date) = ${Number(year)}`
          : undefined,
        item ? eq(sections.item, item) : undefined,
      ),
    )
    .groupBy(
      filings.id,
      filings.accessionNumber,
      filings.form,
      filings.filingDate,
      filings.filingUrl,
    )
    .orderBy(desc(filings.filingDate))
    .limit(80);

  const filtered = q
    ? rows.filter(
        (r) =>
          r.accessionNumber.toLowerCase().includes(q) ||
          r.form.toLowerCase().includes(q) ||
          (r.filingDate ?? "").includes(q) ||
          (r.items ?? "").toLowerCase().includes(q),
      )
    : rows;

  res.json({
    ticker,
    filings: filtered.map((r) => ({
      ...r,
      items: (r.items ?? "").split(",").filter(Boolean),
      year: (r.filingDate ?? "").slice(0, 4),
    })),
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

