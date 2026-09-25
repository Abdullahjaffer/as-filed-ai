export type Health = { ok: boolean; service: string };

export type Company = {
  ticker: string;
  name: string;
  cik: string;
  sic?: string | null;
  sicDescription?: string | null;
  filingCount?: number;
};

export type FactRow = {
  concept: string;
  value: string;
  unit: string;
  endDate: string | null;
  form: string | null;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  accessionNumber?: string;
};

export type FilingRow = {
  accessionNumber: string;
  form: string;
  filingDate: string;
  filingUrl: string;
};

export type SearchResultRow = {
  ticker: string;
  sic?: string | null;
  sicDescription?: string | null;
  accessionNumber: string;
  form: string;
  filingDate: string;
  filingUrl: string;
  item?: string | null;
  title?: string | null;
  sectionId?: string | null;
  chunkId?: string | null;
  snippet?: string | null;
  hasText?: boolean;
};

export type OutlineSection = {
  id: string;
  item: string;
  title: string;
  level: number;
  children: OutlineSection[];
};

export type FilingDetail = {
  filing: {
    accessionNumber: string;
    form: string;
    filingDate: string;
    filingUrl: string;
    ticker: string;
    name: string;
    cik: string;
    sic?: string | null;
    sicDescription?: string | null;
  };
  sections: OutlineSection[];
  documents: Array<{
    id: string;
    kind: string;
    documentType: string;
    filename: string;
  }>;
};

export type MatrixColumn = {
  accessionNumber: string;
  form: string;
  filingDate: string;
  filingUrl: string;
  label: string;
  ticker: string;
  name: string;
};

export type MatrixRowMeta = { item: string; title: string };

export type MatrixGridCell = {
  sectionId: string;
  title: string;
  snippet: string;
};

export type MatrixGrid = {
  ticker: string;
  tickers?: string[];
  name: string;
  columns: MatrixColumn[];
  rows: MatrixRowMeta[];
  cells: Record<string, MatrixGridCell>;
};

export type SectionFilingRow = {
  ticker?: string;
  accessionNumber: string;
  form: string;
  filingDate: string;
  filingUrl: string;
  items: string[];
  year: string;
};

export type ChatMessage = {
  key: string;
  role: "user" | "assistant";
  content: string;
  loading?: boolean;
};

export type TraceRow = {
  id: string;
  stepIndex: number;
  toolName: string;
  input: unknown;
  output: unknown;
};

export type PromptItem = { key: string; title: string; prompt: string };

export type BriefPayload = {
  company: Company;
  metrics: {
    revenue: FactRow | null;
    operatingIncome: FactRow | null;
    netIncome: FactRow | null;
    dilutedEps: FactRow | null;
  };
  annualTimeline?: Array<{
    year: number;
    revenue?: FactRow;
    operatingIncome?: FactRow;
    netIncome?: FactRow;
    dilutedEps?: FactRow;
  }>;
  latest: {
    tenK: FilingRow | null;
    tenQ: FilingRow | null;
    eightK: FilingRow | null;
  };
  riskDiff: {
    newerAccession: string | null;
    olderAccession: string | null;
    item: string;
  };
  peers: Company[];
  filings: FilingRow[];
  filingsByYear?: Array<{
    year: string;
    count: number;
    forms: Record<string, number>;
    filings: FilingRow[];
  }>;
  window?: {
    years: number | null;
    since: string | null;
    through?: string | null;
    filingCount?: number;
  };
  prompts: PromptItem[];
};

export type EvidenceItem = {
  key: string;
  kind: "fact" | "passage" | "diff";
  title: string;
  detail: string;
  url?: string;
};

export type ChangeSeed = {
  ticker: string;
  item: string;
  older?: string;
  newer?: string;
};
