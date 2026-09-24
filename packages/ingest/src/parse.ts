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

export type ParsedSection = {
  item: string;
  title: string;
  body: string;
};

const SECTION_PATTERNS: Array<{ item: string; title: string; pattern: RegExp }> = [
  {
    item: "1",
    title: "Business",
    pattern: /item\s*1[.\s]*business\b/i,
  },
  {
    item: "1A",
    title: "Risk Factors",
    pattern: /item\s*1a[.\s]*risk\s+factors\b/i,
  },
  {
    item: "7",
    title: "MD&A",
    pattern: /item\s*7[.\s]*management['']?s?\s+discussion/i,
  },
  {
    item: "2",
    title: "MD&A",
    pattern: /item\s*2[.\s]*management['']?s?\s+discussion/i,
  },
];

/** Heuristic section split on Item headings in plain text. */
export function parseSections(plain: string, form: string): ParsedSection[] {
  const text = plain;
  if (!text || text.length < 200) {
    return [];
  }

  const patterns =
    form.startsWith("10-Q")
      ? SECTION_PATTERNS.filter((p) => p.item === "1A" || p.item === "2")
      : form.startsWith("8-K")
        ? [{ item: "8K", title: "Current Report", pattern: /item\s*\d/i }]
        : SECTION_PATTERNS.filter((p) => p.item !== "2");

  const hits: Array<{ item: string; title: string; index: number }> = [];
  for (const p of patterns) {
    const m = text.match(p.pattern);
    if (m && m.index !== undefined) {
      hits.push({ item: p.item, title: p.title, index: m.index });
    }
  }

  hits.sort((a, b) => a.index - b.index);

  if (hits.length === 0) {
    if (form.startsWith("8-K") || form.startsWith("DEF")) {
      return [
        {
          item: form.startsWith("8-K") ? "8K" : "PROXY",
          title: form.startsWith("8-K") ? "Current Report" : "Proxy Statement",
          body: text.slice(0, 100_000),
        },
      ];
    }
    return [];
  }

  const sections: ParsedSection[] = [];
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index;
    const end = i + 1 < hits.length ? hits[i + 1].index : Math.min(text.length, start + 120_000);
    const body = text.slice(start, end).trim();
    if (body.length > 100) {
      sections.push({ item: hits[i].item, title: hits[i].title, body: body.slice(0, 200_000) });
    }
  }
  return sections;
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
