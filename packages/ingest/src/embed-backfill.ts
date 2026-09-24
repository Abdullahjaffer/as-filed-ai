import { chunks, createDb } from "@filing-desk/db";
import { eq, isNull, sql } from "drizzle-orm";
import { embedTexts } from "./embeddings";
import { getDatabaseUrl, requireEnv } from "./env";

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
  const db = createDb(getDatabaseUrl());
  const batchSize = 64;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chunks)
    .where(isNull(chunks.embedding));
  console.log(`Chunks missing embeddings: ${count}`);

  let done = 0;
  while (true) {
    const rows = await db
      .select({ id: chunks.id, content: chunks.content })
      .from(chunks)
      .where(isNull(chunks.embedding))
      .limit(batchSize);
    if (rows.length === 0) {
      break;
    }
    const vectors = await embedWithRetry(
      apiKey,
      rows.map((r) => r.content),
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
