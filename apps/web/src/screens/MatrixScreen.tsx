import {
  Button,
  Card,
  Flex,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { FORM_OPTIONS, YEAR_OPTIONS } from "../constants.ts";
import { documentPath } from "../paths.ts";
import type {
  Company,
  MatrixGrid,
  MatrixRowMeta,
  SectionFilingRow,
} from "../types.ts";

export function Component() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const seedKey = params.get("accessions") ?? "";
  const seedAccessions = useMemo(
    () => seedKey.split(",").map((part) => part.trim()).filter(Boolean),
    [seedKey],
  );
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [watchlist, setWatchlist] = useState<Company[]>([]);
  const [tickers, setTickers] = useState<string[]>([]);
  const [focusTicker, setFocusTicker] = useState<string | undefined>(undefined);
  const [docForm, setDocForm] = useState<string | undefined>(undefined);
  const [docYear, setDocYear] = useState<string | undefined>(undefined);
  const [docQuery, setDocQuery] = useState("");
  const [docRows, setDocRows] = useState<SectionFilingRow[]>([]);
  const [docLoading, setDocLoading] = useState(false);
  const [selectedAccessions, setSelectedAccessions] = useState<string[]>([]);
  const [grid, setGrid] = useState<MatrixGrid | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetch("/api/companies")
      .then((r) => r.json())
      .then((json: { companies: Company[] }) => setWatchlist(json.companies));
  }, []);

  useEffect(() => {
    if (seedAccessions.length < 2) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    const query = new URLSearchParams({ accessions: seedKey });
    void fetch(`/api/matrix/by-accessions?${query}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Matrix failed (${res.status})`);
        }
        return (await res.json()) as MatrixGrid;
      })
      .then((json) => {
        if (!cancelled) {
          setGrid(json);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          message.error(
            cause instanceof Error ? cause.message : "Matrix failed",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [seedKey, seedAccessions.length]);

  const peersByTicker = useMemo(() => {
    const map = new Map<string, Company[]>();
    for (const c of watchlist) {
      map.set(
        c.ticker,
        watchlist.filter((p) => p.ticker !== c.ticker),
      );
    }
    return map;
  }, [watchlist]);

  const loadDocuments = useCallback(async () => {
    if (tickers.length === 0) {
      setDocRows([]);
      return;
    }
    setDocLoading(true);
    try {
      const query = new URLSearchParams();
      if (docForm) {
        query.set("form", docForm);
      }
      if (docYear) {
        query.set("year", docYear);
      }
      if (docQuery.trim()) {
        query.set("q", docQuery.trim());
      }
      const qs = query.toString();
      const results = await Promise.all(
        tickers.map(async (t) => {
          const res = await fetch(
            `/api/companies/${t}/section-filings${qs ? `?${qs}` : ""}`,
          );
          if (!res.ok) {
            return [] as SectionFilingRow[];
          }
          const json = (await res.json()) as { filings: SectionFilingRow[] };
          return json.filings.map((f) => ({ ...f, ticker: t }));
        }),
      );
      const merged = results.flat().sort((a, b) => {
        const byDate = (b.filingDate ?? "").localeCompare(a.filingDate ?? "");
        if (byDate !== 0) {
          return byDate;
        }
        return (a.ticker ?? "").localeCompare(b.ticker ?? "");
      });
      setDocRows(merged);
    } catch (cause) {
      message.error(
        cause instanceof Error ? cause.message : "Load filings failed",
      );
    } finally {
      setDocLoading(false);
    }
  }, [tickers, docForm, docYear, docQuery]);

  useEffect(() => {
    if (step === 1 && tickers.length > 0) {
      void loadDocuments();
    }
  }, [step, tickers, loadDocuments]);

  function addTicker(t: string) {
    setTickers((prev) => (prev.includes(t) ? prev : [...prev, t].slice(0, 8)));
    setFocusTicker(t);
  }

  function openWizard(reset = true) {
    if (reset) {
      setStep(0);
      setTickers([]);
      setFocusTicker(undefined);
      setSelectedAccessions([]);
      setDocForm(undefined);
      setDocYear(undefined);
      setDocQuery("");
    } else if (grid) {
      const fromGrid =
        grid.tickers ?? [...new Set(grid.columns.map((c) => c.ticker))];
      setTickers(fromGrid);
      setFocusTicker(fromGrid[0]);
      setSelectedAccessions(grid.columns.map((c) => c.accessionNumber));
      setStep(0);
    }
    setWizardOpen(true);
  }

  async function createMatrix() {
    if (tickers.length === 0 || selectedAccessions.length < 2) {
      message.warning("Select companies and at least two filings");
      return;
    }
    setLoading(true);
    try {
      const query = new URLSearchParams({
        accessions: selectedAccessions.join(","),
      });
      const res = await fetch(`/api/matrix/by-accessions?${query}`);
      if (!res.ok) {
        throw new Error(`Matrix failed (${res.status})`);
      }
      const json = (await res.json()) as MatrixGrid;
      setGrid(json);
      setParams({ accessions: selectedAccessions.join(",") }, { replace: true });
      setWizardOpen(false);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "Matrix failed");
    } finally {
      setLoading(false);
    }
  }

  const companyOptions = useMemo(
    () =>
      watchlist.map((c) => ({
        value: c.ticker,
        label: `${c.ticker} · ${c.name}`,
      })),
    [watchlist],
  );

  const focusPeers =
    focusTicker && peersByTicker.get(focusTicker)
      ? peersByTicker.get(focusTicker)!
      : tickers.length > 0
        ? (peersByTicker.get(tickers[tickers.length - 1]) ?? [])
        : [];

  const tableColumns = useMemo(() => {
    if (!grid) {
      return [];
    }
    const cols: Array<{
      title: ReactNode;
      dataIndex?: string;
      key: string;
      fixed?: "left";
      width: number;
      render?: (value: unknown, record: MatrixRowMeta) => ReactNode;
    }> = [
      {
        title: "Section",
        key: "section",
        fixed: "left",
        width: 160,
        render: (_: unknown, record: MatrixRowMeta) => (
          <div>
            <Typography.Text strong>Item {record.item}</Typography.Text>
            <br />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {record.title}
            </Typography.Text>
          </div>
        ),
      },
    ];
    for (const col of grid.columns) {
      cols.push({
        title: (
          <div>
            <div>{col.label}</div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {col.filingDate}
            </Typography.Text>
          </div>
        ),
        key: col.accessionNumber,
        width: 280,
        render: (_: unknown, record: MatrixRowMeta) => {
          const cell = grid.cells[`${record.item}|${col.accessionNumber}`];
          if (!cell) {
            return <Typography.Text type="secondary">—</Typography.Text>;
          }
          return (
            <div
              role="button"
              tabIndex={0}
              style={{ cursor: "pointer" }}
              onClick={() =>
                navigate(documentPath(col.accessionNumber, cell.sectionId))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  navigate(documentPath(col.accessionNumber, cell.sectionId));
                }
              }}
            >
              <Typography.Paragraph
                ellipsis={{ rows: 5 }}
                style={{ marginBottom: 4, fontSize: 12 }}
              >
                {cell.snippet}
              </Typography.Paragraph>
              <Button type="link" size="small" style={{ padding: 0 }}>
                Open
              </Button>
            </div>
          );
        },
      });
    }
    return cols;
  }, [grid, navigate]);

  const gridTickers =
    grid?.tickers ??
    (grid ? [...new Set(grid.columns.map((c) => c.ticker))] : []);

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card>
        <Flex justify="space-between" align="flex-start" wrap gap={12}>
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              Section matrix
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Pick one or more companies (peers listed for quick add), then
              filings. Rows are all stored sections; columns scroll horizontally.
            </Typography.Paragraph>
          </div>
          <Space wrap>
            {grid ? (
              <Button onClick={() => openWizard(false)}>Edit matrix</Button>
            ) : null}
            <Button type="primary" onClick={() => openWizard(true)}>
              Build matrix
            </Button>
          </Space>
        </Flex>
      </Card>

      {!grid ? (
        <Card>
          <Flex vertical align="center" gap={12} style={{ padding: 32 }}>
            <Typography.Text type="secondary">
              No matrix yet. Pick companies, then two or more filings.
            </Typography.Text>
            <Button type="primary" onClick={() => openWizard(true)}>
              Build matrix
            </Button>
          </Flex>
        </Card>
      ) : (
        <>
          <Card size="small">
            <Space wrap>
              {gridTickers.map((t) => (
                <Tag key={t} color="blue">
                  {t}
                </Tag>
              ))}
              <Tag>{grid.rows.length} sections</Tag>
              <Tag>{grid.columns.length} filings</Tag>
            </Space>
          </Card>
          <Card styles={{ body: { padding: 0 } }}>
            <Spin spinning={loading}>
              <Table
                size="small"
                rowKey="item"
                pagination={false}
                dataSource={grid.rows}
                columns={tableColumns}
                scroll={{ x: 160 + grid.columns.length * 280, y: 560 }}
                bordered
              />
            </Spin>
          </Card>
        </>
      )}

      <Modal
        title="Build section matrix"
        open={wizardOpen}
        onCancel={() => setWizardOpen(false)}
        width={760}
        destroyOnHidden
        footer={
          <Flex justify="space-between">
            <Button
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </Button>
            <Space>
              <Button onClick={() => setWizardOpen(false)}>Cancel</Button>
              {step === 0 ? (
                <Button
                  type="primary"
                  disabled={tickers.length === 0}
                  onClick={() => setStep(1)}
                >
                  Next
                </Button>
              ) : (
                <Button
                  type="primary"
                  loading={loading}
                  disabled={selectedAccessions.length < 2 || tickers.length === 0}
                  onClick={() => void createMatrix()}
                >
                  Create matrix
                </Button>
              )}
            </Space>
          </Flex>
        }
      >
        <Steps
          size="small"
          current={step}
          style={{ marginBottom: 24 }}
          items={[{ title: "Companies" }, { title: "Documents" }]}
        />

        {step === 0 ? (
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Select one or more companies. Peers for the focused company appear
              below for one-click add.
            </Typography.Paragraph>
            <Select
              mode="multiple"
              showSearch
              allowClear
              style={{ width: "100%" }}
              placeholder="Search ticker or name"
              value={tickers}
              optionFilterProp="label"
              options={companyOptions}
              onChange={(values) => {
                const next = values.slice(0, 8);
                setTickers(next);
                setSelectedAccessions([]);
                setFocusTicker(
                  focusTicker && next.includes(focusTicker)
                    ? focusTicker
                    : next[next.length - 1],
                );
              }}
              onSelect={(value) => setFocusTicker(value)}
              filterOption={(input, option) =>
                String(option?.label ?? "")
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
            />
            {tickers.length > 0 ? (
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Selected
                </Typography.Text>
                <div style={{ marginTop: 6 }}>
                  <Space wrap>
                    {tickers.map((t) => {
                      const c = watchlist.find((x) => x.ticker === t);
                      return (
                        <Tag
                          key={t}
                          color={t === focusTicker ? "blue" : undefined}
                          style={{ cursor: "pointer" }}
                          onClick={() => setFocusTicker(t)}
                          closable
                          onClose={(e) => {
                            e.preventDefault();
                            setTickers((prev) => {
                              const next = prev.filter((x) => x !== t);
                              if (focusTicker === t) {
                                setFocusTicker(next[0]);
                              }
                              return next;
                            });
                          }}
                        >
                          {c ? `${t} · ${c.name}` : t}
                        </Tag>
                      );
                    })}
                  </Space>
                </div>
              </div>
            ) : null}
            {(focusTicker ?? tickers[0]) ? (
              <Card
                size="small"
                title={`Peers for ${focusTicker ?? tickers[0]}`}
                styles={{ body: { paddingBlock: 12 } }}
              >
                {focusPeers.length === 0 ? (
                  <Typography.Text type="secondary">
                    No other ingested peers yet.
                  </Typography.Text>
                ) : (
                  <Space direction="vertical" style={{ width: "100%" }} size={8}>
                    {focusPeers.map((p) => {
                      const selected = tickers.includes(p.ticker);
                      return (
                        <Flex
                          key={p.ticker}
                          justify="space-between"
                          align="center"
                          gap={8}
                        >
                          <div>
                            <Typography.Text strong>{p.ticker}</Typography.Text>
                            <Typography.Text type="secondary">
                              {" "}
                              · {p.name}
                            </Typography.Text>
                          </div>
                          <Button
                            size="small"
                            type={selected ? "default" : "primary"}
                            disabled={selected}
                            onClick={() => addTicker(p.ticker)}
                          >
                            {selected ? "Added" : "Add"}
                          </Button>
                        </Flex>
                      );
                    })}
                  </Space>
                )}
              </Card>
            ) : null}
          </Space>
        ) : null}

        {step === 1 ? (
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Select at least two filings across {tickers.join(", ")}. The matrix
              shows every stored section for those filings.
            </Typography.Paragraph>
            <Space wrap>
              <Select
                allowClear
                style={{ width: 140 }}
                placeholder="Form"
                value={docForm}
                onChange={setDocForm}
                options={FORM_OPTIONS.filter((f) =>
                  [
                    "10-K",
                    "10-K/A",
                    "10-Q",
                    "10-Q/A",
                    "8-K",
                    "8-K/A",
                    "DEF 14A",
                  ].includes(f.value),
                )}
              />
              <Select
                allowClear
                style={{ width: 120 }}
                placeholder="Year"
                value={docYear}
                onChange={setDocYear}
                options={YEAR_OPTIONS}
              />
              <Input.Search
                allowClear
                style={{ width: 240 }}
                placeholder="Filter accession / form"
                value={docQuery}
                onChange={(e) => setDocQuery(e.target.value)}
                onSearch={() => void loadDocuments()}
              />
            </Space>
            <Table
              size="small"
              rowKey="accessionNumber"
              loading={docLoading}
              dataSource={docRows}
              pagination={{ pageSize: 8 }}
              rowSelection={{
                selectedRowKeys: selectedAccessions,
                onChange: (keys) =>
                  setSelectedAccessions((keys as string[]).slice(0, 12)),
              }}
              locale={{
                emptyText: `No filings with stored sections for ${tickers.join(", ")}.`,
              }}
              columns={[
                {
                  title: "Ticker",
                  dataIndex: "ticker",
                  width: 80,
                },
                { title: "Year", dataIndex: "year", width: 70 },
                { title: "Form", dataIndex: "form", width: 90 },
                { title: "Filed", dataIndex: "filingDate", width: 110 },
                {
                  title: "Items",
                  dataIndex: "items",
                  render: (items: string[]) => items.join(", "),
                },
                {
                  title: "Accession",
                  dataIndex: "accessionNumber",
                  ellipsis: true,
                },
              ]}
            />
            <Typography.Text type="secondary">
              {selectedAccessions.length} selected (max 12)
            </Typography.Text>
          </Space>
        ) : null}
      </Modal>
    </Space>
  );
}
