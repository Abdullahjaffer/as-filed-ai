/**
 * Form outlines are data. A new form, item, or noise phrase is an entry here.
 * The heading walker does not mention a company or a form by name.
 */

export const PARSER_VERSION = "1";

export type HeadingDetector = "bold" | "anchor";

export type FormOutline = {
  /** Base form. Amendments such as 10-K/A use this record. */
  form: string;
  detector: HeadingDetector;
  /** Item code → canonical title. Codes are uppercase (`1A`, `8.01`). */
  items: Record<string, string>;
  /**
   * When true, any `Item N` / `Item N.NN` heading is a level-0 section,
   * even if the code is not listed above. The map still supplies titles.
   */
  acceptAnyItem: boolean;
  fallback: { item: string; title: string } | null;
};

const TEN_K_ITEMS: Record<string, string> = {
  "1": "Business",
  "1A": "Risk Factors",
  "1B": "Unresolved Staff Comments",
  "1C": "Cybersecurity",
  "2": "Properties",
  "3": "Legal Proceedings",
  "4": "Mine Safety Disclosures",
  "5": "Market for Registrant's Common Equity",
  "6": "Reserved",
  "7": "MD&A",
  "7A": "Quantitative and Qualitative Disclosures About Market Risk",
  "8": "Financial Statements",
  "9": "Changes in and Disagreements with Accountants",
  "9A": "Controls and Procedures",
  "9B": "Other Information",
  "9C": "Disclosure Regarding Foreign Jurisdictions",
  "10": "Directors, Executive Officers and Corporate Governance",
  "11": "Executive Compensation",
  "12": "Security Ownership",
  "13": "Certain Relationships and Related Transactions",
  "14": "Principal Accountant Fees and Services",
  "15": "Exhibits and Financial Statement Schedules",
  "16": "Form 10-K Summary",
};

const TEN_Q_ITEMS: Record<string, string> = {
  "1": "Financial Statements",
  "1A": "Risk Factors",
  "2": "MD&A",
  "3": "Quantitative and Qualitative Disclosures About Market Risk",
  "4": "Controls and Procedures",
  "5": "Other Information",
  "6": "Exhibits",
};

/** Common 8-K item numbers. Unknown numbers still match when acceptAnyItem is set. */
const EIGHT_K_ITEMS: Record<string, string> = {
  "1.01": "Entry into a Material Definitive Agreement",
  "1.02": "Termination of a Material Definitive Agreement",
  "2.01": "Completion of Acquisition or Disposition of Assets",
  "2.02": "Results of Operations and Financial Condition",
  "5.02": "Departure or Appointment of Directors or Officers",
  "7.01": "Regulation FD Disclosure",
  "8.01": "Other Events",
  "9.01": "Financial Statements and Exhibits",
};

const OUTLINES: FormOutline[] = [
  {
    form: "10-K",
    detector: "bold",
    items: TEN_K_ITEMS,
    acceptAnyItem: false,
    fallback: null,
  },
  {
    form: "10-Q",
    detector: "bold",
    items: TEN_Q_ITEMS,
    acceptAnyItem: false,
    fallback: null,
  },
  {
    form: "8-K",
    detector: "bold",
    items: EIGHT_K_ITEMS,
    acceptAnyItem: true,
    fallback: { item: "8K", title: "Current Report" },
  },
  {
    form: "DEF 14A",
    detector: "anchor",
    items: {},
    acceptAnyItem: false,
    fallback: { item: "PROXY", title: "Proxy Statement" },
  },
  {
    form: "EX-99",
    detector: "bold",
    items: {},
    acceptAnyItem: true,
    fallback: { item: "EXHIBIT", title: "Exhibit" },
  },
];

const BY_FORM = new Map(OUTLINES.map((outline) => [outline.form, outline]));

export function baseForm(form: string): string {
  return form.split("/")[0].trim().toUpperCase();
}

export function outlineFor(form: string, kind: "primary" | "exhibit" = "primary"): FormOutline {
  if (kind === "exhibit") {
    return BY_FORM.get("EX-99") ?? OUTLINES[0];
  }
  return BY_FORM.get(baseForm(form)) ?? {
    form: baseForm(form),
    detector: "bold",
    items: {},
    acceptAnyItem: false,
    fallback: null,
  };
}

/** Column labels and other bold text that is not a section title. */
export const NOISE_TITLES = new Set([
  "year ended",
  "years ended",
  "three months ended",
  "six months ended",
  "nine months ended",
  "change",
  "%change",
  "$change",
  "% change",
  "$ change",
  "name",
  "position",
  "assets",
  "liabilities",
  "liabilities and shareholders' equity",
  "liabilities and stockholders' equity",
  "shares",
  "amount",
  "page",
  "part",
  "part i",
  "part ii",
  "part iii",
  "part iv",
  "table of contents",
  "index",
  "unaudited",
  "form 10-k",
  "form 10-q",
  "form 8-k",
  "signature",
  "signatures",
  "exhibit",
  "description",
  "number",
  "title of each class",
  "trading symbol(s)",
  "name of each exchange on which registered",
]);

export function isNoiseTitle(title: string): boolean {
  const text = title.replace(/\s+/g, " ").trim();
  if (text.length < 4 || text.length > 400) {
    return true;
  }
  if (!/[A-Za-z]/.test(text)) {
    return true;
  }
  const key = text
    .toLowerCase()
    .replace(/^\(+|\)+$/g, "")
    .replace(/[.:]+$/g, "")
    .trim();
  if (NOISE_TITLES.has(key)) {
    return true;
  }
  if (/^\(.*\)$/.test(text) && text.length < 80) {
    return true;
  }
  if (/\bin millions\b/i.test(text) && text.length < 80) {
    return true;
  }
  if (/^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(text)) {
    return true;
  }
  if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(text)) {
    return true;
  }
  if (/^\$|^[\d\s,$%.()-]+$/.test(text)) {
    return true;
  }
  if (/^\d{4}$/.test(text)) {
    return true;
  }
  return false;
}
