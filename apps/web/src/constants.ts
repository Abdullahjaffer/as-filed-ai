export const FORM_OPTIONS = [
  "10-K",
  "10-K/A",
  "10-Q",
  "10-Q/A",
  "8-K",
  "8-K/A",
  "DEF 14A",
  "3",
  "4",
  "5",
].map((v) => ({ value: v, label: v }));

export const SECTION_ITEM_OPTIONS = [
  { value: "1A", label: "1A Risk Factors" },
  { value: "1", label: "1 Business" },
  { value: "7", label: "7 MD&A" },
  { value: "2", label: "2 MD&A (10-Q)" },
  { value: "8K", label: "8-K body" },
  { value: "PROXY", label: "Proxy" },
];

export const SECTION_GROUPS: {
  form: string;
  options: { item: string; label: string }[];
}[] = [
  {
    form: "10-K",
    options: [
      { item: "1", label: "1 Business" },
      { item: "1A", label: "1A Risk Factors" },
      { item: "1C", label: "1C Cybersecurity" },
      { item: "7", label: "7 MD&A" },
      { item: "7A", label: "7A Market risk" },
      { item: "8", label: "8 Financial statements" },
    ],
  },
  {
    form: "10-Q",
    options: [
      { item: "1", label: "1 Financial statements" },
      { item: "1A", label: "1A Risk Factors" },
      { item: "2", label: "2 MD&A" },
      { item: "3", label: "3 Market risk" },
      { item: "4", label: "4 Controls" },
    ],
  },
  {
    form: "8-K",
    options: [
      { item: "2.02", label: "2.02 Results of operations" },
      { item: "7.01", label: "7.01 Regulation FD" },
      { item: "8.01", label: "8.01 Other events" },
      { item: "9.01", label: "9.01 Exhibits" },
    ],
  },
  {
    form: "DEF 14A",
    options: [{ item: "PROXY", label: "Proxy statement" }],
  },
];

export function baseFormName(form: string | undefined): string | undefined {
  return form?.split("/")[0];
}

export const YEAR_OPTIONS = Array.from({ length: 15 }, (_, i) => {
  const y = String(2026 - i);
  return { value: y, label: y };
});
