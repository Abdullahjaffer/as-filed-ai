/** SEC fair-access HTTP client: User-Agent + paced requests. */

const MIN_INTERVAL_MS = 120;

let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pace(): Promise<void> {
  const now = Date.now();
  const wait = MIN_INTERVAL_MS - (now - lastRequestAt);
  if (wait > 0) {
    await sleep(wait);
  }
  lastRequestAt = Date.now();
}

export class SecClient {
  constructor(private readonly userAgent: string) {}

  async getJson<T>(url: string): Promise<T> {
    await pace();
    const response = await fetch(url, {
      headers: {
        "User-Agent": this.userAgent,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SEC ${response.status} for ${url}: ${body.slice(0, 200)}`);
    }
    return (await response.json()) as T;
  }

  async getText(url: string): Promise<string> {
    await pace();
    const response = await fetch(url, {
      headers: {
        "User-Agent": this.userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SEC ${response.status} for ${url}: ${body.slice(0, 200)}`);
    }
    return response.text();
  }
}

export function padCik(cik: number | string): string {
  return String(cik).replace(/^0+/, "").padStart(10, "0");
}

export function cikNoZeros(cik: string): string {
  return cik.replace(/^0+/, "") || "0";
}

export function accessionNoDashes(accession: string): string {
  return accession.replace(/-/g, "");
}

export function filingArchiveUrl(cik: string, accession: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${cikNoZeros(cik)}/${accessionNoDashes(accession)}/${accession}.txt`;
}

export function filingIndexUrl(cik: string, accession: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${cikNoZeros(cik)}/${accessionNoDashes(accession)}/${accession}-index.htm`;
}
