import type { EvidenceItem, FactRow, TraceRow } from "./types.ts";

export function formatMoney(value: string, unit: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return value;
  }
  if (unit === "USD") {
    if (Math.abs(n) >= 1_000_000_000) {
      return `${(n / 1_000_000_000).toFixed(2)}B`;
    }
    if (Math.abs(n) >= 1_000_000) {
      return `${(n / 1_000_000).toFixed(2)}M`;
    }
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function evidenceFromTraces(traces: TraceRow[]): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  for (const trace of traces) {
    const output = trace.output as Record<string, unknown> | null;
    if (!output || typeof output !== "object") {
      continue;
    }
    if (trace.toolName === "getFacts" && Array.isArray(output.facts)) {
      for (const fact of output.facts.slice(0, 6) as FactRow[]) {
        items.push({
          key: `${trace.id}-${fact.concept}-${fact.endDate}`,
          kind: "fact",
          title: `${fact.concept} · ${fact.form ?? "XBRL"}`,
          detail: `${formatMoney(fact.value, fact.unit)} ${fact.unit} · end ${fact.endDate ?? "n/a"} · ${fact.accessionNumber ?? ""}`,
        });
      }
    }
    if (trace.toolName === "searchFilings" && Array.isArray(output.results)) {
      for (const row of output.results.slice(0, 4) as Array<{
        title?: string;
        form?: string;
        filingDate?: string;
        content?: string;
        filingUrl?: string;
        accessionNumber?: string;
      }>) {
        items.push({
          key: `${trace.id}-${row.accessionNumber}-${row.content?.slice(0, 24)}`,
          kind: "passage",
          title: `${row.form ?? "Filing"} · ${row.title ?? "passage"} · ${row.filingDate ?? ""}`,
          detail: (row.content ?? "").slice(0, 280),
          url: row.filingUrl,
        });
      }
    }
    if (trace.toolName === "readSection" && typeof output.body === "string") {
      items.push({
        key: `${trace.id}-section`,
        kind: "passage",
        title: `Item ${String(output.item)} · ${String(output.form)} · ${String(output.filingDate)}`,
        detail: output.body.slice(0, 280),
        url: typeof output.filingUrl === "string" ? output.filingUrl : undefined,
      });
    }
    if (trace.toolName === "diffSections") {
      const added = Array.isArray(output.added) ? output.added.length : 0;
      const removed = Array.isArray(output.removed) ? output.removed.length : 0;
      items.push({
        key: `${trace.id}-diff`,
        kind: "diff",
        title: "Section diff",
        detail: `${added} added passages, ${removed} removed passages`,
      });
    }
  }
  return items;
}

export async function readChatStream(
  res: Response,
  onDelta: (text: string) => void,
): Promise<string> {
  if (!res.body) {
    throw new Error("Empty chat stream");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let assistant = "";
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") {
        continue;
      }
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          textDelta?: string;
        };
        const delta =
          event.delta ??
          event.textDelta ??
          (event.type === "text-delta" ? event.delta : undefined);
        if (typeof delta === "string" && delta.length > 0) {
          assistant += delta;
          onDelta(assistant);
        }
      } catch {
        // ignore partial JSON
      }
    }
  }
  return assistant;
}

export function readableText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}
