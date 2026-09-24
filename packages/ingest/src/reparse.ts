import { companies, createDb, documents, filings } from "@filing-desk/db";
import { and, eq, inArray, or, isNull, ne } from "drizzle-orm";
import { getDatabaseUrl } from "./env.ts";
import { PARSER_VERSION } from "./outline.ts";
import { resolveTickers } from "./pipeline.ts";
import { replaceDocumentSections } from "./store-sections.ts";

async function main(): Promise<void> {
  const tickers = resolveTickers(process.argv.slice(2));
  const db = createDb(getDatabaseUrl());
  console.log(`Reparse ${PARSER_VERSION}: ${tickers.join(", ")}`);

  const rows = await db
    .select({
      documentId: documents.id,
      filingId: filings.id,
      companyId: companies.id,
      form: filings.form,
      kind: documents.kind,
      html: documents.content,
      ticker: companies.ticker,
      accessionNumber: filings.accessionNumber,
      parserVersion: documents.parserVersion,
    })
    .from(documents)
    .innerJoin(filings, eq(documents.filingId, filings.id))
    .innerJoin(companies, eq(filings.companyId, companies.id))
    .where(
      and(
        inArray(companies.ticker, tickers),
        or(isNull(documents.parserVersion), ne(documents.parserVersion, PARSER_VERSION)),
      ),
    );

  console.log(`${rows.length} documents to reparse`);
  let done = 0;
  for (const row of rows) {
    const kind = row.kind === "exhibit" ? "exhibit" : "primary";
    const count = await replaceDocumentSections(db, {
      documentId: row.documentId,
      filingId: row.filingId,
      companyId: row.companyId,
      form: row.form,
      kind,
      html: row.html,
    });
    done += 1;
    console.log(
      `${done}/${rows.length} ${row.ticker} ${row.form} ${row.accessionNumber} sections ${count}`,
    );
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
