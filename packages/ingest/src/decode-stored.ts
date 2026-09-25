import { chunks, createDb, sections } from "@filing-desk/db";
import { eq } from "drizzle-orm";
import { getDatabaseUrl } from "./env.ts";
import { decodeEntities } from "./parse.ts";

async function main(): Promise<void> {
  const db = createDb(getDatabaseUrl());
  const sectionRows = await db
    .select({ id: sections.id, body: sections.body, title: sections.title })
    .from(sections);
  let sectionUpdates = 0;
  for (const row of sectionRows) {
    const body = decodeEntities(row.body);
    const title = decodeEntities(row.title);
    if (body === row.body && title === row.title) {
      continue;
    }
    await db
      .update(sections)
      .set({ body, title })
      .where(eq(sections.id, row.id));
    sectionUpdates += 1;
  }

  const chunkRows = await db
    .select({ id: chunks.id, content: chunks.content })
    .from(chunks);
  let chunkUpdates = 0;
  for (const row of chunkRows) {
    const content = decodeEntities(row.content);
    if (content === row.content) {
      continue;
    }
    await db.update(chunks).set({ content }).where(eq(chunks.id, row.id));
    chunkUpdates += 1;
  }

  console.log(
    `Decoded entities in ${sectionUpdates} sections and ${chunkUpdates} chunks.`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
