import { chunks, createDb, documents, sections } from "@filing-desk/db";
import { eq, inArray } from "drizzle-orm";
import { parseDocument, type ParsedNode } from "./headings.ts";
import { PARSER_VERSION } from "./outline.ts";
import { chunkText } from "./parse.ts";

type Db = ReturnType<typeof createDb>;

function leafIndexes(nodes: ParsedNode[]): number[] {
  const parents = new Set<number>();
  for (const node of nodes) {
    if (node.parentIndex !== null) {
      parents.add(node.parentIndex);
    }
  }
  return nodes.flatMap((node, index) =>
    parents.has(index) || node.body.length < 40 ? [] : [index],
  );
}

/** Replace sections and leaf chunks for one stored document. */
export async function replaceDocumentSections(
  db: Db,
  input: {
    documentId: string;
    filingId: string;
    companyId: string;
    form: string;
    kind: "primary" | "exhibit";
    html: string;
  },
): Promise<number> {
  const existing = await db
    .select({ id: sections.id })
    .from(sections)
    .where(eq(sections.documentId, input.documentId));
  if (existing.length > 0) {
    const ids = existing.map((row) => row.id);
    await db.update(sections).set({ parentId: null }).where(eq(sections.documentId, input.documentId));
    await db.delete(chunks).where(inArray(chunks.sectionId, ids));
    await db.delete(sections).where(eq(sections.documentId, input.documentId));
  }

  const nodes = parseDocument(input.html, input.form, input.kind);
  const ids: string[] = [];
  for (let ordinal = 0; ordinal < nodes.length; ordinal++) {
    const node = nodes[ordinal];
    const parentId = node.parentIndex === null ? null : ids[node.parentIndex];
    const [row] = await db
      .insert(sections)
      .values({
        documentId: input.documentId,
        filingId: input.filingId,
        companyId: input.companyId,
        parentId,
        ordinal,
        level: node.level,
        item: node.item,
        title: node.title,
        body: node.body,
      })
      .returning({ id: sections.id });
    ids.push(row.id);
  }

  const leaves = leafIndexes(nodes);
  for (const index of leaves) {
    const node = nodes[index];
    const parts = chunkText(node.body).filter((part) => part.trim().length > 0);
    if (parts.length === 0) {
      continue;
    }
    await db.insert(chunks).values(
      parts.map((content, ordinal) => ({
        sectionId: ids[index],
        companyId: input.companyId,
        filingId: input.filingId,
        ordinal,
        content,
        embedding: null,
      })),
    );
  }

  await db
    .update(documents)
    .set({ parserVersion: PARSER_VERSION })
    .where(eq(documents.id, input.documentId));

  return nodes.length;
}
