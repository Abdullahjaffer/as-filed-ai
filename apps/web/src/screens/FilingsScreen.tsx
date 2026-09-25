import {
  Button,
  Card,
  Col,
  Flex,
  Input,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  FORM_OPTIONS,
  SECTION_GROUPS,
  YEAR_OPTIONS,
  baseFormName,
} from "../constants.ts";
import { comparePath, documentPath, matrixPath, peersPath } from "../paths.ts";
import type { Company, SearchResultRow } from "../types.ts";

function filingRowKey(row: SearchResultRow): string {
  return `${row.accessionNumber}-${row.chunkId ?? row.sectionId ?? "index"}`;
}

export function Component() {
  const navigate = useNavigate();
  const [companiesList, setCompaniesList] = useState<Company[]>([]);
  const [ticker, setTicker] = useState<string | undefined>(undefined);
  const [form, setForm] = useState<string | undefined>(undefined);
  const [year, setYear] = useState<string | undefined>(undefined);
  const [item, setItem] = useState<string | undefined>(undefined);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [textOnly, setTextOnly] = useState(true);
  const [mode, setMode] = useState<string>("index");
  const [rows, setRows] = useState<SearchResultRow[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetch("/api/companies")
      .then((r) => r.json())
      .then((json: { companies: Company[] }) => setCompaniesList(json.companies));
  }, []);

  const runSearch = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (ticker) {
        params.set("ticker", ticker);
      }
      if (form) {
        params.set("form", form);
      }
      if (year) {
        params.set("year", year);
      }
      if (item) {
        params.set("item", item);
      }
      if (keyword.trim()) {
        params.set("q", keyword.trim());
      }
      if (textOnly) {
        params.set("text", "1");
      }
      const res = await fetch(`/api/search?${params}`);
      if (!res.ok) {
        throw new Error(`Search failed (${res.status})`);
      }
      const json = (await res.json()) as {
        mode: string;
        results: SearchResultRow[];
      };
      setMode(json.mode);
      setRows(json.results);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [ticker, form, year, item, keyword, textOnly]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

  useEffect(() => {
    const live = new Set(rows.map(filingRowKey));
    setSelectedKeys((prev) => prev.filter((key) => live.has(key)));
  }, [rows]);

  const selectedDocs = useMemo(() => {
    const byKey = new Map(rows.map((row) => [filingRowKey(row), row]));
    const seen = new Set<string>();
    const picked: SearchResultRow[] = [];
    for (const key of selectedKeys) {
      const row = byKey.get(key);
      if (!row || seen.has(row.accessionNumber) || row.hasText === false) {
        continue;
      }
      seen.add(row.accessionNumber);
      picked.push(row);
    }
    return picked;
  }, [rows, selectedKeys]);

  function submitKeyword(value?: string) {
    setKeyword((value ?? keywordDraft).trim());
  }

  return (
    <Row gutter={16}>
      <Col xs={24} md={6}>
        <Card title="Filters" size="small">
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            <div>
              <Typography.Text type="secondary">Company</Typography.Text>
              <Select
                allowClear
                style={{ width: "100%", marginTop: 4 }}
                placeholder="All companies"
                value={ticker}
                onChange={setTicker}
                options={companiesList.map((c) => ({
                  value: c.ticker,
                  label: `${c.ticker} · ${c.name}`,
                }))}
              />
            </div>
            <div>
              <Typography.Text type="secondary">Form</Typography.Text>
              <Select
                allowClear
                style={{ width: "100%", marginTop: 4 }}
                placeholder="Any form"
                value={form}
                onChange={(next) => {
                  setForm(next);
                  const group = SECTION_GROUPS.find(
                    (entry) => entry.form === baseFormName(next),
                  );
                  if (item && !group?.options.some((option) => option.item === item)) {
                    setItem(undefined);
                  }
                }}
                options={FORM_OPTIONS}
              />
            </div>
            <div>
              <Typography.Text type="secondary">Filing year</Typography.Text>
              <Select
                allowClear
                style={{ width: "100%", marginTop: 4 }}
                placeholder="Any year"
                value={year}
                onChange={setYear}
                options={YEAR_OPTIONS}
              />
            </div>
            <div>
              <Typography.Text type="secondary">Section</Typography.Text>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: "100%", marginTop: 4 }}
                placeholder="Any parsed section"
                value={
                  item && baseFormName(form)
                    ? `${baseFormName(form)}:${item}`
                    : undefined
                }
                onChange={(value) => {
                  if (!value) {
                    setItem(undefined);
                    return;
                  }
                  const [nextForm, nextItem] = value.split(":");
                  setForm(nextForm);
                  setItem(nextItem);
                }}
                options={SECTION_GROUPS.filter(
                  (group) => !form || group.form === baseFormName(form),
                ).map((group) => ({
                  label: group.form,
                  options: group.options.map((option) => ({
                    value: `${group.form}:${option.item}`,
                    label: option.label,
                  })),
                }))}
              />
            </div>
            <Flex align="center" justify="space-between">
              <Typography.Text type="secondary">Downloaded text</Typography.Text>
              <Switch checked={textOnly} onChange={setTextOnly} />
            </Flex>
            <Button
              block
              disabled={!ticker && !form && !year && !item && !keyword && textOnly}
              onClick={() => {
                setTicker(undefined);
                setForm(undefined);
                setYear(undefined);
                setItem(undefined);
                setKeywordDraft("");
                setKeyword("");
                setTextOnly(true);
              }}
            >
              Clear filters
            </Button>
            <div>
              <Typography.Text type="secondary">Keywords</Typography.Text>
              <Input.Search
                style={{ marginTop: 4 }}
                placeholder="Full-text in stored sections"
                value={keywordDraft}
                onChange={(e) => setKeywordDraft(e.target.value)}
                onSearch={(v) => submitKeyword(v)}
                enterButton="Search"
              />
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Keyword and section filters only hit filings with downloaded text.
              Forms 3/4/5 stay index-only.
            </Typography.Text>
            {ticker ? (
              <Button
                block
                onClick={() =>
                  navigate(
                    peersPath([
                      ticker,
                      ...companiesList
                        .map((c) => c.ticker)
                        .filter((t) => t !== ticker)
                        .slice(0, 3),
                    ]),
                  )
                }
              >
                Peer metrics for {ticker}
              </Button>
            ) : null}
          </Space>
        </Card>
      </Col>
      <Col xs={24} md={18}>
        <Card
          title={
            mode === "keyword"
              ? "Keyword results"
              : mode === "section"
                ? "Section results"
                : "Filing index"
          }
          extra={<Tag>{rows.length} rows</Tag>}
        >
          <Flex
            justify="space-between"
            align="center"
            wrap
            gap={8}
            style={{ marginBottom: 12 }}
          >
            <Typography.Text type="secondary">
              {selectedDocs.length === 0
                ? "Select filings to compare or build a matrix."
                : `${selectedDocs.length} filing${selectedDocs.length === 1 ? "" : "s"} selected`}
            </Typography.Text>
            <Space wrap>
              <Button
                disabled={selectedDocs.length !== 2}
                onClick={() => {
                  const [left, right] = selectedDocs;
                  if (!left || !right) {
                    return;
                  }
                  navigate(
                    comparePath(
                      left.accessionNumber,
                      right.accessionNumber,
                      left.sectionId ?? null,
                    ),
                  );
                }}
              >
                Compare
              </Button>
              <Button
                type="primary"
                disabled={selectedDocs.length < 2 || selectedDocs.length > 12}
                onClick={() =>
                  navigate(
                    matrixPath(selectedDocs.map((row) => row.accessionNumber)),
                  )
                }
              >
                Create matrix
              </Button>
              <Button
                disabled={selectedKeys.length === 0}
                onClick={() => setSelectedKeys([])}
              >
                Clear
              </Button>
            </Space>
          </Flex>
          <Table
            size="small"
            rowKey={filingRowKey}
            rowSelection={{
              selectedRowKeys: selectedKeys,
              preserveSelectedRowKeys: true,
              onChange: (keys) => setSelectedKeys(keys.map(String)),
              getCheckboxProps: (row) => ({
                disabled: row.hasText === false,
              }),
            }}
            loading={loading}
            dataSource={rows}
            locale={{
              emptyText:
                keyword || item
                  ? "No stored sections matched. Try another keyword, clear section filter, or browse the index without keywords (Forms 3/4/5 are index-only)."
                  : "No filings matched these filters.",
            }}
            pagination={{ pageSize: 12 }}
            onRow={(record) => ({
              onClick: () =>
                navigate(documentPath(record.accessionNumber, record.sectionId)),
              style: { cursor: "pointer" },
            })}
            columns={[
              { title: "Ticker", dataIndex: "ticker", width: 80 },
              { title: "Form", dataIndex: "form", width: 90 },
              { title: "Filed", dataIndex: "filingDate", width: 110 },
              {
                title: "Accession",
                dataIndex: "accessionNumber",
                width: 180,
                ellipsis: true,
              },
              {
                title: "SIC",
                dataIndex: "sic",
                width: 70,
                render: (v: string | null | undefined) => v ?? "—",
              },
              {
                title: "Section",
                width: 180,
                ellipsis: true,
                render: (_, row) =>
                  row.item ? (
                    <span>
                      {row.item}
                      {row.title ? ` · ${row.title}` : ""}
                    </span>
                  ) : (
                    "—"
                  ),
              },
              {
                title: "Snippet / note",
                render: (_, row) =>
                  row.snippet ? (
                    <Typography.Paragraph
                      ellipsis={{ rows: 2 }}
                      style={{ marginBottom: 0 }}
                    >
                      {row.snippet}
                    </Typography.Paragraph>
                  ) : row.hasText ? (
                    <Tag color="blue">text stored</Tag>
                  ) : (
                    <Tag>index only</Tag>
                  ),
              },
            ]}
          />
        </Card>
      </Col>
    </Row>
  );
}
