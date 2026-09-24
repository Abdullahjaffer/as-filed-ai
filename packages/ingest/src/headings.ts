import { isNoiseTitle, outlineFor, type FormOutline } from "./outline.ts";
import { stripHtml } from "./parse.ts";

export type ParsedNode = {
  item: string;
  title: string;
  level: number;
  parentIndex: number | null;
  body: string;
};

type RawHeading = {
  text: string;
  index: number;
  end: number;
};

const BODY_CAP = 500_000;
const ITEM_RE = /^item\s+([0-9]{1,2}[a-c]?(?:\.\d{2})?)\b[.\s:–—-]*(.*)$/i;
const BLOCK_BOUNDARY = /<\/(?:div|p|td|tr|table|h[1-6]|li|br)\b|<(?:div|p|td|tr|table|h[1-6]|li|br)\b/i;

function decodeEntities(value: string): string {
  return value
    .replace(/&#160;|&nbsp;/gi, " ")
    .replace(/&#8217;|&#39;|&rsquo;|&apos;/gi, "'")
    .replace(/&#8220;|&#8221;|&quot;/gi, '"')
    .replace(/&#8211;|&ndash;/gi, "-")
    .replace(/&#8212;|&mdash;/gi, "-")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
    });
}

function cleanText(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeCode(code: string): string {
  const match = code.toUpperCase().match(/^(\d+)([A-C])?(?:\.(\d+))?$/);
  if (!match) {
    return code.toUpperCase();
  }
  const suffix = match[2] ?? "";
  const decimal = match[3] ? `.${match[3].padStart(2, "0")}` : "";
  return `${match[1]}${suffix}${decimal}`;
}

/** Bold or weighted spans, merged when a heading is split across adjacent tags. */
export function detectBoldHeadings(html: string): RawHeading[] {
  const re = /<(span|b|strong)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  const spans: RawHeading[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const tag = match[1].toLowerCase();
    const attrs = match[2] ?? "";
    const bold =
      tag === "b" ||
      tag === "strong" ||
      /font-weight\s*:\s*(?:bold|[6-9]00)\b/i.test(attrs);
    if (!bold) {
      continue;
    }
    const text = cleanText(match[3] ?? "");
    if (!text) {
      continue;
    }
    const index = match.index;
    const end = match.index + match[0].length;
    const prev = spans[spans.length - 1];
    const gap = prev ? html.slice(prev.end, index) : "";
    if (
      prev &&
      index - prev.end < 120 &&
      !BLOCK_BOUNDARY.test(gap) &&
      (prev.text + text).length <= 280
    ) {
      const gapText = cleanText(gap);
      const joiner = gapText.length > 0 ? " " : "";
      prev.text = `${prev.text}${joiner}${text}`.replace(/\s+/g, " ").trim();
      prev.end = end;
    } else {
      spans.push({ text, index, end });
    }
  }
  return spans;
}

/**
 * Proxy and similar filings mark sections with internal links.
 * The id target is the body heading; the table-of-contents link is ignored.
 */
export function detectAnchorHeadings(html: string): RawHeading[] {
  const ids = new Set<string>();
  const hrefRe = /href\s*=\s*["']#([^"']+)["']/gi;
  let href: RegExpExecArray | null;
  while ((href = hrefRe.exec(html))) {
    ids.add(href[1]);
  }
  const headings: RawHeading[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const idRe = new RegExp(`\\bid\\s*=\\s*["']${escaped}["']`, "i");
    const found = idRe.exec(html);
    if (!found || found.index === undefined) {
      continue;
    }
    const tagEnd = html.indexOf(">", found.index);
    if (tagEnd < 0) {
      continue;
    }
    const after = html.slice(tagEnd + 1, tagEnd + 800);
    const close = after.search(/<\/(?:span|a|p|div|td|h[1-6])>/i);
    const chunk = close > 0 ? after.slice(0, close) : after.slice(0, 180);
    const text = cleanText(chunk).slice(0, 180);
    if (!text || /^id=/i.test(text) || /table of contents/i.test(text) || isNoiseTitle(text)) {
      continue;
    }
    headings.push({ text, index: found.index, end: found.index + found[0].length });
  }
  headings.sort((a, b) => a.index - b.index);
  return headings;
}

function itemFromHeading(
  text: string,
  outline: FormOutline,
): { code: string; title: string } | null {
  const match = text.match(ITEM_RE);
  if (!match) {
    return null;
  }
  const code = normalizeCode(match[1]);
  const known = outline.items[code];
  if (!known && !outline.acceptAnyItem) {
    return null;
  }
  const rest = (match[2] ?? "").replace(/\s+/g, " ").trim();
  const title = rest.length >= 3 ? rest.slice(0, 180) : (known ?? `Item ${code}`);
  return { code, title };
}

function slugItem(title: string, used: Set<string>): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "section";
  let item = base;
  let n = 2;
  while (used.has(item)) {
    item = `${base}-${n}`;
    n += 1;
  }
  used.add(item);
  return item;
}

function plainSlice(html: string, start: number, end: number): string {
  const raw = html.slice(start, Math.max(start, end));
  const text = stripHtml(raw);
  return text.length > BODY_CAP ? text.slice(0, BODY_CAP) : text;
}

/**
 * Walk headings into a tree. Level 0 is an SEC item (or a proxy heading).
 * Level 1 is a narrative subsection. parentIndex points at the parent node
 * so a later third level can reuse the same shape.
 */
export function parseDocument(
  html: string,
  form: string,
  kind: "primary" | "exhibit" = "primary",
): ParsedNode[] {
  if (!html || html.length < 200) {
    return [];
  }
  const outline = outlineFor(form, kind);
  const raw =
    outline.detector === "anchor" ? detectAnchorHeadings(html) : detectBoldHeadings(html);

  type ItemHit = RawHeading & { code: string; title: string };
  const itemHits: ItemHit[] = [];
  for (const heading of raw) {
    const item = itemFromHeading(heading.text, outline);
    if (!item) {
      continue;
    }
    itemHits.push({ ...heading, code: item.code, title: item.title });
  }

  const toc = tocIndexes(itemHits);
  const items = itemHits.filter((hit) => !toc.has(hit.index));

  if (items.length === 0 && outline.detector === "anchor") {
    return anchorOutline(raw, html, outline);
  }

  if (items.length === 0) {
    return fallbackNode(html, outline);
  }

  const usedCodes = new Set<string>();
  const level0: Array<ItemHit & { item: string }> = items.map((hit) => {
    let item = hit.code;
    if (usedCodes.has(item)) {
      item = `II-${hit.code}`;
      let n = 2;
      while (usedCodes.has(item)) {
        item = `II-${hit.code}-${n}`;
        n += 1;
      }
    }
    usedCodes.add(item);
    return { ...hit, item };
  });

  const nodes: ParsedNode[] = [];
  for (let i = 0; i < level0.length; i++) {
    const current = level0[i];
    const next = level0[i + 1];
    const bodyEnd = next ? next.index : html.length;
    const parentIndex = nodes.length;
    nodes.push({
      item: current.item,
      title: current.title,
      level: 0,
      parentIndex: null,
      body: plainSlice(html, current.end, bodyEnd),
    });

    const subs = raw.filter(
      (heading) =>
        heading.index > current.end &&
        heading.index < bodyEnd &&
        !itemFromHeading(heading.text, outline) &&
        !isNoiseTitle(heading.text),
    );
    for (let s = 0; s < subs.length; s++) {
      const sub = subs[s];
      const subEnd = s + 1 < subs.length ? subs[s + 1].index : bodyEnd;
      const body = plainSlice(html, sub.end, subEnd);
      if (body.length < 40) {
        continue;
      }
      nodes.push({
        item: current.item,
        title: sub.text.slice(0, 180),
        level: 1,
        parentIndex,
        body,
      });
    }
  }

  return nodes;
}

function tocIndexes(items: Array<{ index: number }>): Set<number> {
  const skip = new Set<number>();
  let runStart = 0;
  for (let i = 0; i <= items.length; i++) {
    const gap =
      i > 0 && i < items.length ? items[i].index - items[i - 1].index : Number.POSITIVE_INFINITY;
    const runEnded = gap > 4000 || i === items.length;
    if (!runEnded) {
      continue;
    }
    const run = items.slice(runStart, i);
    if (run.length >= 4) {
      for (const hit of run) {
        skip.add(hit.index);
      }
    }
    runStart = i;
  }
  return skip;
}

function anchorOutline(raw: RawHeading[], html: string, outline: FormOutline): ParsedNode[] {
  const headings = raw.filter((heading) => !isNoiseTitle(heading.text));
  if (headings.length === 0) {
    return fallbackNode(html, outline);
  }
  const used = new Set<string>();
  const nodes: ParsedNode[] = [];
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const end = i + 1 < headings.length ? headings[i + 1].index : html.length;
    const body = plainSlice(html, heading.end, end);
    if (body.length < 80) {
      continue;
    }
    nodes.push({
      item: slugItem(heading.text, used),
      title: heading.text.slice(0, 180),
      level: 0,
      parentIndex: null,
      body,
    });
  }
  return nodes.length > 0 ? nodes : fallbackNode(html, outline);
}

function fallbackNode(html: string, outline: FormOutline): ParsedNode[] {
  if (!outline.fallback) {
    return [];
  }
  const body = plainSlice(html, 0, html.length);
  if (body.length < 80) {
    return [];
  }
  return [
    {
      item: outline.fallback.item,
      title: outline.fallback.title,
      level: 0,
      parentIndex: null,
      body,
    },
  ];
}
