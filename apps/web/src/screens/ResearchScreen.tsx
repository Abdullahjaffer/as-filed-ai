import {
  Button,
  Card,
  Col,
  Collapse,
  Flex,
  Input,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { Bubble, Prompts, Sender, ThoughtChain, Welcome } from "@ant-design/x";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { evidenceFromTraces, formatMoney, readChatStream } from "../format.ts";
import { changesPath, documentPath, peersPath } from "../paths.ts";
import type { BriefPayload, ChatMessage, Company, TraceRow } from "../types.ts";

const roles = {
  assistant: { placement: "start" as const },
  user: { placement: "end" as const },
};

export function Component() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const ticker = (params.get("ticker") || "NVDA").toUpperCase();
  const [query, setQuery] = useState(ticker);
  const [watchlist, setWatchlist] = useState<Company[]>([]);
  const [brief, setBrief] = useState<BriefPayload | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [traces, setTraces] = useState<TraceRow[]>([]);

  const evidence = useMemo(() => evidenceFromTraces(traces), [traces]);

  const loadBrief = useCallback(async (t: string) => {
    const tickerUp = t.trim().toUpperCase();
    if (!tickerUp) {
      return;
    }
    const res = await fetch(`/api/companies/${tickerUp}/brief`);
    if (!res.ok) {
      message.error(`Company ${tickerUp} not found. Run pnpm ingest -- ${tickerUp}`);
      return;
    }
    const json = (await res.json()) as BriefPayload;
    setBrief(json);
    setQuery(tickerUp);
    setMessages([]);
    setConversationId(null);
    setTraces([]);
  }, []);

  function openTicker(raw: string) {
    const next = raw.trim().toUpperCase();
    if (!next) {
      return;
    }
    if (next === ticker) {
      void loadBrief(next);
      return;
    }
    setParams({ ticker: next }, { replace: true });
  }

  useEffect(() => {
    void fetch("/api/companies")
      .then((r) => r.json())
      .then((json: { companies: Company[] }) => setWatchlist(json.companies));
  }, []);

  useEffect(() => {
    void loadBrief(ticker);
  }, [loadBrief, ticker]);

  async function sendChat(text: string) {
    if (!brief || !text.trim()) {
      return;
    }
    const userMsg: ChatMessage = {
      key: `u-${Date.now()}`,
      role: "user",
      content: text.trim(),
    };
    const next = [...messages, userMsg];
    setMessages([
      ...next,
      { key: `a-${Date.now()}`, role: "assistant", content: "", loading: true },
    ]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          messages: next.map((m) => ({
            id: m.key,
            role: m.role,
            parts: [{ type: "text", text: m.content }],
          })),
        }),
      });
      const newConversationId =
        res.headers.get("X-Conversation-Id") ?? conversationId;
      if (newConversationId) {
        setConversationId(newConversationId);
      }
      if (!res.ok) {
        throw new Error(`Chat failed (${res.status})`);
      }

      const assistant = await readChatStream(res, (textSoFar) => {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant") {
            copy[copy.length - 1] = {
              ...last,
              content: textSoFar,
              loading: true,
            };
          }
          return copy;
        });
      });

      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant") {
          copy[copy.length - 1] = {
            ...last,
            content: assistant || last.content || "(no text)",
            loading: false,
          };
        }
        return copy;
      });

      if (newConversationId) {
        const tRes = await fetch(
          `/api/conversations/${newConversationId}/traces`,
        );
        if (tRes.ok) {
          const tJson = (await tRes.json()) as { traces: TraceRow[] };
          setTraces(tJson.traces);
        }
      }
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "Chat failed");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  const metricCards = brief
    ? [
        { title: "Revenue", fact: brief.metrics.revenue },
        { title: "Operating income", fact: brief.metrics.operatingIncome },
        { title: "Net income", fact: brief.metrics.netIncome },
        { title: "Diluted EPS", fact: brief.metrics.dilutedEps },
      ]
    : [];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card>
        <Flex justify="space-between" align="flex-start" wrap gap={16}>
          <Space direction="vertical" size={8} style={{ flex: 1 }}>
            <Typography.Title level={3} style={{ margin: 0 }}>
              Research brief
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Open a filer, read the XBRL scorecard, then ask citation-backed
              questions. This is the core equity-research workflow Filing Desk
              is built for.
            </Typography.Paragraph>
            <Space wrap>
              <Input.Search
                placeholder="Ticker"
                value={query}
                onChange={(e) => setQuery(e.target.value.toUpperCase())}
                onSearch={(v) => openTicker(v)}
                enterButton="Open"
                style={{ width: 280 }}
              />
              {watchlist.map((c) => (
                <Tag
                  key={c.ticker}
                  style={{ cursor: "pointer" }}
                  color={c.ticker === brief?.company.ticker ? "blue" : undefined}
                  onClick={() => openTicker(c.ticker)}
                >
                  {c.ticker}
                </Tag>
              ))}
            </Space>
          </Space>
          {brief ? (
            <Space>
              <Button
                onClick={() =>
                  navigate(
                    peersPath([
                      brief.company.ticker,
                      ...brief.peers.map((p) => p.ticker).slice(0, 3),
                    ]),
                  )
                }
              >
                Compare peers
              </Button>
              <Button
                type="primary"
                disabled={
                  !brief.riskDiff.olderAccession || !brief.riskDiff.newerAccession
                }
                onClick={() =>
                  navigate(
                    changesPath({
                      ticker: brief.company.ticker,
                      item: "1A",
                      older: brief.riskDiff.olderAccession ?? undefined,
                      newer: brief.riskDiff.newerAccession ?? undefined,
                    }),
                  )
                }
              >
                Diff risk factors
              </Button>
            </Space>
          ) : null}
        </Flex>
      </Card>

      {brief ? (
        <>
          <Card size="small">
            <Flex justify="space-between" wrap gap={12}>
              <div>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {brief.company.name}{" "}
                  <Typography.Text type="secondary">
                    ({brief.company.ticker})
                  </Typography.Text>
                </Typography.Title>
                <Typography.Text type="secondary">
                  CIK {brief.company.cik}
                  {brief.company.sicDescription
                    ? ` · ${brief.company.sicDescription}`
                    : ""}
                  {` · ${brief.company.filingCount ?? 0} filings indexed`}
                </Typography.Text>
              </div>
              <Space wrap>
                {brief.latest.tenK ? (
                  <Tag
                    style={{ cursor: "pointer" }}
                    onClick={() =>
                      navigate(documentPath(brief.latest.tenK!.accessionNumber))
                    }
                  >
                    10-K {brief.latest.tenK.filingDate}{" "}
                    <a
                      href={brief.latest.tenK.filingUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      EDGAR
                    </a>
                  </Tag>
                ) : null}
                {brief.latest.tenQ ? (
                  <Tag
                    style={{ cursor: "pointer" }}
                    onClick={() =>
                      navigate(documentPath(brief.latest.tenQ!.accessionNumber))
                    }
                  >
                    10-Q {brief.latest.tenQ.filingDate}{" "}
                    <a
                      href={brief.latest.tenQ.filingUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      EDGAR
                    </a>
                  </Tag>
                ) : null}
                {brief.latest.eightK ? (
                  <Tag
                    style={{ cursor: "pointer" }}
                    onClick={() =>
                      navigate(documentPath(brief.latest.eightK!.accessionNumber))
                    }
                  >
                    8-K {brief.latest.eightK.filingDate}{" "}
                    <a
                      href={brief.latest.eightK.filingUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      EDGAR
                    </a>
                  </Tag>
                ) : null}
              </Space>
            </Flex>
          </Card>

          <Row gutter={16}>
            {metricCards.map((s) => (
              <Col xs={12} md={6} key={s.title}>
                <Card size="small">
                  <Statistic
                    title={s.title}
                    value={
                      s.fact ? formatMoney(s.fact.value, s.fact.unit) : "—"
                    }
                    suffix={
                      s.fact && s.fact.unit !== "USD" ? s.fact.unit : undefined
                    }
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {s.fact
                      ? `${s.fact.form ?? "XBRL"} · ${s.fact.endDate}`
                      : "No annual fact yet"}
                  </Typography.Text>
                </Card>
              </Col>
            ))}
          </Row>

          <Row gutter={16}>
            <Col xs={24} lg={15}>
              <Card
                title="Ask the filings"
                styles={{ body: { minHeight: 480 } }}
              >
                {messages.length === 0 ? (
                  <Flex vertical gap={16} style={{ marginBottom: 16 }}>
                    <Welcome
                      variant="borderless"
                      title={`Research ${brief.company.ticker}`}
                      description="Start with a scorecard, risks, MD&A, or a full brief. Answers must cite XBRL facts or quoted passages."
                    />
                    <Prompts
                      title="Analyst starters"
                      items={brief.prompts.map((p) => ({
                        key: p.key,
                        label: p.title,
                        description: p.prompt.slice(0, 90) + "…",
                      }))}
                      wrap
                      onItemClick={(info) => {
                        const prompt = brief.prompts.find(
                          (p) => p.key === info.data.key,
                        );
                        if (prompt) {
                          void sendChat(prompt.prompt);
                        }
                      }}
                    />
                  </Flex>
                ) : (
                  <Bubble.List
                    style={{ height: 360, overflow: "auto", marginBottom: 12 }}
                    role={roles}
                    autoScroll
                    items={messages.map((m) => ({
                      key: m.key,
                      role: m.role,
                      content: m.content,
                      loading: m.loading,
                    }))}
                  />
                )}
                <Sender
                  value={input}
                  loading={loading}
                  onChange={setInput}
                  onSubmit={(v) => void sendChat(v)}
                  placeholder={`Ask about ${brief.company.ticker} filings…`}
                />
              </Card>
            </Col>
            <Col xs={24} lg={9}>
              <Card title="Evidence" style={{ marginBottom: 16 }}>
                {evidence.length === 0 ? (
                  <Typography.Text type="secondary">
                    Facts and quoted passages from tool calls show up here after
                    you ask a question.
                  </Typography.Text>
                ) : (
                  <Space direction="vertical" style={{ width: "100%" }}>
                    {evidence.map((e) => (
                      <Card key={e.key} size="small" type="inner">
                        <Space size={4} wrap>
                          <Tag
                            color={
                              e.kind === "fact"
                                ? "green"
                                : e.kind === "diff"
                                  ? "orange"
                                  : "blue"
                            }
                          >
                            {e.kind}
                          </Tag>
                          <Typography.Text strong>{e.title}</Typography.Text>
                        </Space>
                        <Typography.Paragraph
                          style={{ marginBottom: 0, marginTop: 6 }}
                          ellipsis={{ rows: 3, expandable: true }}
                        >
                          {e.detail}
                        </Typography.Paragraph>
                        {e.url ? (
                          <a href={e.url} target="_blank" rel="noreferrer">
                            Open on EDGAR
                          </a>
                        ) : null}
                      </Card>
                    ))}
                  </Space>
                )}
              </Card>
              <Card
                title={
                  brief.window?.since && brief.window?.through
                    ? `Annual XBRL timeline · ${brief.window.since.slice(0, 4)}–${brief.window.through.slice(0, 4)}`
                    : "Annual XBRL timeline · all years"
                }
                style={{ marginBottom: 16 }}
              >
                <Table
                  size="small"
                  rowKey="year"
                  pagination={false}
                  dataSource={brief.annualTimeline ?? []}
                  locale={{ emptyText: "No annual facts yet" }}
                  columns={[
                    { title: "Year", dataIndex: "year", width: 70 },
                    {
                      title: "Revenue",
                      render: (_, row) =>
                        row.revenue
                          ? formatMoney(row.revenue.value, row.revenue.unit)
                          : "—",
                    },
                    {
                      title: "Op. income",
                      render: (_, row) =>
                        row.operatingIncome
                          ? formatMoney(
                              row.operatingIncome.value,
                              row.operatingIncome.unit,
                            )
                          : "—",
                    },
                    {
                      title: "Net income",
                      render: (_, row) =>
                        row.netIncome
                          ? formatMoney(row.netIncome.value, row.netIncome.unit)
                          : "—",
                    },
                    {
                      title: "EPS",
                      render: (_, row) =>
                        row.dilutedEps
                          ? formatMoney(
                              row.dilutedEps.value,
                              row.dilutedEps.unit,
                            )
                          : "—",
                    },
                  ]}
                />
              </Card>
              <Card
                title={
                  brief.window?.since && brief.window?.through
                    ? `Filings by year · ${brief.window.since.slice(0, 4)}–${brief.window.through.slice(0, 4)} (${brief.window.filingCount ?? brief.filingsByYear?.reduce((n, b) => n + b.count, 0) ?? 0})`
                    : "Filings by year · all available"
                }
                style={{ marginBottom: 16 }}
              >
                {(brief.filingsByYear ?? []).length === 0 ? (
                  <Typography.Text type="secondary">
                    No filings indexed.
                  </Typography.Text>
                ) : (
                  <Collapse
                    size="small"
                    defaultActiveKey={
                      brief.filingsByYear?.[0]
                        ? [brief.filingsByYear[0].year]
                        : []
                    }
                    items={(brief.filingsByYear ?? []).map((bucket) => ({
                      key: bucket.year,
                      label: (
                        <Space wrap>
                          <Typography.Text strong>{bucket.year}</Typography.Text>
                          <Tag>{bucket.count} filings</Tag>
                          {Object.entries(bucket.forms)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 5)
                            .map(([form, n]) => (
                              <Tag key={form}>
                                {form} ×{n}
                              </Tag>
                            ))}
                        </Space>
                      ),
                      children: (
                        <Table
                          size="small"
                          rowKey="accessionNumber"
                          pagination={{ pageSize: 8 }}
                          dataSource={bucket.filings}
                          onRow={(row) => ({
                            onClick: () =>
                              navigate(documentPath(row.accessionNumber)),
                            style: { cursor: "pointer" },
                          })}
                          columns={[
                            { title: "Form", dataIndex: "form", width: 90 },
                            {
                              title: "Filed",
                              dataIndex: "filingDate",
                              width: 110,
                            },
                            {
                              title: "View",
                              render: (_, row) => (
                                <Button
                                  type="link"
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(documentPath(row.accessionNumber));
                                  }}
                                >
                                  open
                                </Button>
                              ),
                            },
                            {
                              title: "EDGAR",
                              dataIndex: "filingUrl",
                              render: (url: string) => (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  edgar
                                </a>
                              ),
                            },
                          ]}
                        />
                      ),
                    }))}
                  />
                )}
              </Card>
              <Card title="Tool trace" style={{ marginBottom: 16 }}>
                {traces.length === 0 ? (
                  <Typography.Text type="secondary">
                    resolveCompany → getFacts / searchFilings / readSection…
                  </Typography.Text>
                ) : (
                  <ThoughtChain
                    items={traces.map((t) => ({
                      key: t.id,
                      title: t.toolName,
                      description: (
                        <Typography.Paragraph
                          ellipsis={{ rows: 3, expandable: true }}
                          style={{ marginBottom: 0, fontSize: 12 }}
                        >
                          {JSON.stringify(
                            { input: t.input, output: t.output },
                            null,
                            2,
                          )}
                        </Typography.Paragraph>
                      ),
                      status: "success" as const,
                    }))}
                  />
                )}
              </Card>
            </Col>
          </Row>
        </>
      ) : (
        <Card>
          <Typography.Text type="secondary">
            Load an ingested ticker to open a research brief.
          </Typography.Text>
        </Card>
      )}
    </Space>
  );
}
