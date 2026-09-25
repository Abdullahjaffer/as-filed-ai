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

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  ldquo: '"',
  rdquo: '"',
  lsquo: "'",
  rsquo: "'",
  ndash: "-",
  mdash: "-",
  hellip: "...",
  bull: "•",
};

function fromCodePoint(code: number): string {
  if (
    !Number.isInteger(code) ||
    code <= 0 ||
    code > 0x10ffff ||
    (code >= 0xd800 && code <= 0xdfff)
  ) {
    return " ";
  }
  return String.fromCodePoint(code);
}

/** Turn HTML character references into the characters they stand for. */
export function decodeEntities(value: string): string {
  let current = value;
  for (let pass = 0; pass < 2; pass++) {
    const next = current.replace(
      /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
      (entity, body: string) => {
        if (body[0] !== "#") {
          return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
        }
        const hex = body[1] === "x" || body[1] === "X";
        const code = hex
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
        return fromCodePoint(code);
      },
    );
    if (next === current) {
      break;
    }
    current = next;
  }
  return current;
}

export function stripHtml(html: string): string {
  const text = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
  return text.replace(/\s+/g, " ").trim();
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
