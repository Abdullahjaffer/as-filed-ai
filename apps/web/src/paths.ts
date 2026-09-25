import type { ChangeSeed } from "./types.ts";

export function peersPath(tickers: string[]): string {
  const params = new URLSearchParams();
  if (tickers.length > 0) {
    params.set("tickers", tickers.join(","));
  }
  const qs = params.toString();
  return qs ? `/peers?${qs}` : "/peers";
}

export function changesPath(seed: ChangeSeed): string {
  const params = new URLSearchParams({
    ticker: seed.ticker,
    item: seed.item,
  });
  if (seed.older) {
    params.set("older", seed.older);
  }
  if (seed.newer) {
    params.set("newer", seed.newer);
  }
  return `/changes?${params}`;
}

export function documentPath(
  accession: string,
  sectionId?: string | null,
): string {
  const path = `/filings/${encodeURIComponent(accession)}`;
  if (!sectionId) {
    return path;
  }
  return `${path}?section=${encodeURIComponent(sectionId)}`;
}

export function comparePath(
  left: string,
  right?: string | null,
  sectionId?: string | null,
): string {
  const params = new URLSearchParams({ left });
  if (right) {
    params.set("right", right);
  }
  if (sectionId) {
    params.set("section", sectionId);
  }
  return `/compare?${params}`;
}

export function matrixPath(accessions: string[]): string {
  if (accessions.length === 0) {
    return "/matrix";
  }
  return `/matrix?accessions=${encodeURIComponent(accessions.join(","))}`;
}

export function parseList(value: string | null, fallback: string[]): string[] {
  if (!value) {
    return fallback;
  }
  const items = value
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}
