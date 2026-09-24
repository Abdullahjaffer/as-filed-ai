import { chunks, companies, createDb } from "@filing-desk/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { embedTexts } from "./embeddings.ts";
import { getDatabaseUrl, requireEnv } from "./env.ts";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedWithRetry(
  apiKey: string,
  texts: string[],
  attempts = 5,
): Promise<number[][]> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await embedTexts(apiKey, texts);
    } catch (error) {
      lastError = error;
      const wait = 1000 * 2 ** i;
      console.warn(
        `Embed batch failed (attempt ${i + 1}/${attempts}), retry in ${wait}ms`,
      );
      await sleep(wait);
    }
  }
  throw lastError;
}

async function main(): Promise<void> {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const tickers = process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("-"))
    .map((ticker) => ticker.toUpperCase());
  const db = createDb(getDatabaseUrl());
  const batchSize = 64;
  const companyIds =
    tickers.length === 0
      ? []
      : (
          await db
            .select({ id: companies.id })
            .from(companies)
            .where(inArray(companies.ticker, tickers))
        ).map((row) => row.id);
  const tickerFilter =
    companyIds.length > 0 ? inArray(chunks.companyId, companyIds) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chunks)
    .where(and(isNull(chunks.embedding), tickerFilter));
  console.log(
    `Chunks missing embeddings${tickers.length ? ` (${tickers.join(", ")})` : ""}: ${count}`,
  );

  let done = 0;
  while (true) {
    const rows = await db
      .select({ id: chunks.id, content: chunks.content })
      .from(chunks)
      .where(and(isNull(chunks.embedding), tickerFilter))
      .limit(batchSize);
    if (rows.length === 0) {
      break;
    }
    const vectors = await embedWithRetry(
      apiKey,
      rows.map((row) => row.content),
    );
    for (let i = 0; i < rows.length; i++) {
      await db
        .update(chunks)
        .set({ embedding: vectors[i] })
        .where(eq(chunks.id, rows[i].id));
    }
    done += rows.length;
    console.log(`Embedded ${done}/${count}`);
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
