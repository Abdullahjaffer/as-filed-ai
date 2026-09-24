import { createHash } from "node:crypto";

export type SubmissionDocument = {
  type: string;
  filename: string;
  description: string;
  text: string;
};

/** Split a complete EDGAR submission .txt into <DOCUMENT> blocks. */
export function splitSubmissionDocuments(raw: string): SubmissionDocument[] {
  const docs: SubmissionDocument[] = [];
  const parts = raw.split(/<DOCUMENT>/i);
  for (const part of parts.slice(1)) {
    const body = part.split(/<\/DOCUMENT>/i)[0] ?? part;
    const type = matchTag(body, "TYPE") ?? "UNKNOWN";
    const filename = matchTag(body, "FILENAME") ?? "unknown.txt";
    const description = matchTag(body, "DESCRIPTION") ?? "";
    const textMatch = body.match(/<TEXT>([\s\S]*)<\/TEXT>/i);
    const text = textMatch?.[1] ?? body;
    docs.push({ type: type.trim(), filename: filename.trim(), description: description.trim(), text });
  }
  return docs;
}

function matchTag(body: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^\\n<]+)`, "i");
  const m = body.match(re);
  return m?.[1]?.trim() ?? null;
}

export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function chunkText(
  content: string,
  size = 1500,
  overlap = 200,
): string[] {
  const chunks: string[] = [];
  if (content.length <= size) {
    return [content];
  }
  let start = 0;
  while (start < content.length) {
    const end = Math.min(content.length, start + size);
    chunks.push(content.slice(start, end));
    if (end >= content.length) {
      break;
    }
    start = end - overlap;
  }
  return chunks;
}

export function keepDocument(doc: SubmissionDocument, form: string): boolean {
  const type = doc.type.toUpperCase();
  if (type.startsWith("EX-99")) {
    return true;
  }
  const base = form.split("/")[0].toUpperCase();
  if (type === base || type.startsWith(base)) {
    return true;
  }
  if (base === "DEF 14A" && (type.includes("DEF") || type.includes("14A"))) {
    return true;
  }
  return false;
}
