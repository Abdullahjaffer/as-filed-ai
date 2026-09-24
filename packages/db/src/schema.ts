/**
 * Filing Desk database.
 *
 * Companies and filings are the EDGAR index. Documents hold raw filing text.
 * Sections and chunks are the retrieval corpus. Facts are consolidated XBRL
 * values. Messages and traces record agent runs. Eval cases are the frozen
 * questions used to score those runs.
 */
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  cik: text("cik").notNull().unique(),
  ticker: text("ticker").notNull().unique(),
  name: text("name").notNull(),
  sic: text("sic"),
  sicDescription: text("sic_description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const filings = pgTable(
  "filings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    accessionNumber: text("accession_number").notNull(),
    form: text("form").notNull(),
    filingDate: date("filing_date").notNull(),
    reportDate: date("report_date"),
    primaryDocument: text("primary_document"),
    filingUrl: text("filing_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("filings_accession_idx").on(table.accessionNumber),
    index("filings_company_form_idx").on(table.companyId, table.form),
  ],
);

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  filingId: uuid("filing_id")
    .notNull()
    .references(() => filings.id),
  kind: text("kind").notNull(),
  filename: text("filename").notNull(),
  documentType: text("document_type").notNull(),
  sourceUrl: text("source_url").notNull(),
  content: text("content").notNull(),
  sha256: text("sha256").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sections = pgTable("sections", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id),
  filingId: uuid("filing_id")
    .notNull()
    .references(() => filings.id),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  item: text("item").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    filingId: uuid("filing_id")
      .notNull()
      .references(() => filings.id),
    ordinal: integer("ordinal").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("chunks_embedding_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);

export const facts = pgTable(
  "facts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    factKey: text("fact_key").notNull(),
    accessionNumber: text("accession_number").notNull(),
    taxonomy: text("taxonomy").notNull(),
    concept: text("concept").notNull(),
    label: text("label"),
    unit: text("unit").notNull(),
    value: numeric("value").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    form: text("form"),
    fiscalYear: integer("fiscal_year"),
    fiscalPeriod: text("fiscal_period"),
    filed: date("filed"),
  },
  (table) => [
    uniqueIndex("facts_key_idx").on(table.factKey),
    index("facts_company_concept_idx").on(table.companyId, table.concept, table.endDate),
  ],
);

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull(),
  role: text("role").notNull(),
  parts: jsonb("parts").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const traces = pgTable("traces", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull(),
  stepIndex: integer("step_index").notNull(),
  toolName: text("tool_name").notNull(),
  input: jsonb("input").notNull(),
  output: jsonb("output"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const evalCases = pgTable("eval_cases", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticker: text("ticker").notNull(),
  question: text("question").notNull(),
  expected: jsonb("expected").notNull(),
});

export const evalRuns = pgTable("eval_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => evalCases.id),
  passed: boolean("passed").notNull(),
  answer: text("answer").notNull(),
  detail: jsonb("detail").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
