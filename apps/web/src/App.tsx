import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  Flex,
  Form,
  Input,
  Layout,
  Menu,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import {
  Bubble,
  Prompts,
  Sender,
  ThoughtChain,
  Welcome,
  XProvider,
} from "@ant-design/x";
import { useCallback, useEffect, useMemo, useState } from "react";

const { Header, Sider, Content } = Layout;

type SectionKey = "research" | "peers" | "changes" | "evals";

type Health = { ok: boolean; service: string };
type Company = {
  ticker: string;
  name: string;
  cik: string;
  sic?: string | null;
  sicDescription?: string | null;
  filingCount?: number;
};
type FactRow = {
  concept: string;
  value: string;
  unit: string;
  endDate: string | null;
  form: string | null;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  accessionNumber?: string;
};
type FilingRow = {
  accessionNumber: string;
  form: string;
  filingDate: string;
  filingUrl: string;
};
type ChatMessage = {
  key: string;
  role: "user" | "assistant";
  content: string;
  loading?: boolean;
};
type TraceRow = {
  id: string;
  stepIndex: number;
  toolName: string;
  input: unknown;
  output: unknown;
};
type PromptItem = { key: string; title: string; prompt: string };
type BriefPayload = {
  company: Company;
  metrics: {
    revenue: FactRow | null;
    operatingIncome: FactRow | null;
    netIncome: FactRow | null;
    dilutedEps: FactRow | null;
  };
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
  prompts: PromptItem[];
};
type EvidenceItem = {
  key: string;
  kind: "fact" | "passage" | "diff";
  title: string;
  detail: string;
  url?: string;
};

const roles = {
  assistant: { placement: "start" as const },
  user: { placement: "end" as const },
};

function formatMoney(value: string, unit: string): string {
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

function evidenceFromTraces(traces: TraceRow[]): EvidenceItem[] {
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

async function readChatStream(
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

export default function App() {
  const [section, setSection] = useState<SectionKey>("research");
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticker, setTicker] = useState("NVDA");
  const [peerSeed, setPeerSeed] = useState<string[]>(["NVDA", "AMD"]);
  const [changeSeed, setChangeSeed] = useState<{
    ticker: string;
    item: string;
    older?: string;
    newer?: string;
    autoRun?: boolean;
  }>({ ticker: "NVDA", item: "1A" });

  useEffect(() => {
    fetch("/api/health")
      .then((r) => {
        if (!r.ok) {
          throw new Error(`API returned ${r.status}`);
        }
        return r.json() as Promise<Health>;
      })
      .then(setHealth)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "API unreachable");
      });
  }, []);

  return (
    <XProvider>
      <Layout style={{ minHeight: "100vh" }}>
        <Sider breakpoint="lg" collapsedWidth={0} theme="light" width={228}>
          <Flex vertical style={{ height: 64, paddingInline: 20, justifyContent: "center" }}>
            <Typography.Text strong>Filing Desk</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Equity research from EDGAR
            </Typography.Text>
          </Flex>
          <Menu
            mode="inline"
            selectedKeys={[section]}
            items={[
              { key: "research", label: "Research brief" },
              { key: "peers", label: "Peer metrics" },
              { key: "changes", label: "Filing changes" },
              { key: "evals", label: "Evals" },
            ]}
            onClick={({ key }) => setSection(key as SectionKey)}
          />
        </Sider>
        <Layout>
          <Header
            style={{
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingInline: 24,
            }}
          >
            <Typography.Text type="secondary">
              Numbers from XBRL · narrative from filed sections · every claim cited
            </Typography.Text>
            {health ? (
              <Tag color="success">{health.service}</Tag>
            ) : (
              <Tag color={error ? "error" : "processing"}>
                {error ?? "Checking API"}
              </Tag>
            )}
          </Header>
          <Content style={{ margin: 24 }}>
            {error ? (
              <Alert
                style={{ marginBottom: 16 }}
                type="error"
                showIcon
                message="API unreachable"
                description="Run pnpm dev from the repo root (API on :4000)."
              />
            ) : null}
            {section === "research" && (
              <ResearchScreen
                ticker={ticker}
                onTicker={setTicker}
                onOpenPeers={(tickers) => {
                  setPeerSeed(tickers);
                  setSection("peers");
                }}
                onOpenChanges={(seed) => {
                  setChangeSeed({ ...seed, autoRun: true });
                  setSection("changes");
                }}
              />
            )}
            {section === "peers" && (
              <CompareScreen initialTickers={peerSeed} />
            )}
            {section === "changes" && (
              <ChangesScreen seed={changeSeed} />
            )}
            {section === "evals" && <EvalsScreen />}
          </Content>
        </Layout>
      </Layout>
    </XProvider>
  );
}

function ResearchScreen({
  ticker,
  onTicker,
  onOpenPeers,
  onOpenChanges,
}: {
  ticker: string;
  onTicker: (t: string) => void;
  onOpenPeers: (tickers: string[]) => void;
  onOpenChanges: (seed: {
    ticker: string;
    item: string;
    older?: string;
    newer?: string;
  }) => void;
}) {
  const [query, setQuery] = useState(ticker);
  const [watchlist, setWatchlist] = useState<Company[]>([]);
  const [brief, setBrief] = useState<BriefPayload | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [traces, setTraces] = useState<TraceRow[]>([]);

  const evidence = useMemo(() => evidenceFromTraces(traces), [traces]);

  const loadBrief = useCallback(
    async (t: string) => {
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
      onTicker(tickerUp);
      setQuery(tickerUp);
      setMessages([]);
      setConversationId(null);
      setTraces([]);
    },
    [onTicker],
  );

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
                onSearch={(v) => void loadBrief(v)}
                enterButton="Open"
                style={{ width: 280 }}
              />
              {watchlist.map((c) => (
                <Tag
                  key={c.ticker}
                  style={{ cursor: "pointer" }}
                  color={c.ticker === brief?.company.ticker ? "blue" : undefined}
                  onClick={() => void loadBrief(c.ticker)}
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
                  onOpenPeers([
                    brief.company.ticker,
                    ...brief.peers.map((p) => p.ticker).slice(0, 3),
                  ])
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
                  onOpenChanges({
                    ticker: brief.company.ticker,
                    item: "1A",
                    older: brief.riskDiff.olderAccession ?? undefined,
                    newer: brief.riskDiff.newerAccession ?? undefined,
                  })
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
                  <Tag>
                    10-K {brief.latest.tenK.filingDate}{" "}
                    <a href={brief.latest.tenK.filingUrl} target="_blank" rel="noreferrer">
                      EDGAR
                    </a>
                  </Tag>
                ) : null}
                {brief.latest.tenQ ? (
                  <Tag>
                    10-Q {brief.latest.tenQ.filingDate}{" "}
                    <a href={brief.latest.tenQ.filingUrl} target="_blank" rel="noreferrer">
                      EDGAR
                    </a>
                  </Tag>
                ) : null}
                {brief.latest.eightK ? (
                  <Tag>
                    8-K {brief.latest.eightK.filingDate}{" "}
                    <a
                      href={brief.latest.eightK.filingUrl}
                      target="_blank"
                      rel="noreferrer"
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
              <Card title="Recent filings">
                <Table
                  size="small"
                  rowKey="accessionNumber"
                  pagination={{ pageSize: 5 }}
                  dataSource={brief.filings}
                  columns={[
                    { title: "Form", dataIndex: "form", width: 80 },
                    { title: "Filed", dataIndex: "filingDate", width: 100 },
                    {
                      title: "EDGAR",
                      dataIndex: "filingUrl",
                      render: (url: string) => (
                        <a href={url} target="_blank" rel="noreferrer">
                          open
                        </a>
                      ),
                    },
                  ]}
                />
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

function CompareScreen({ initialTickers }: { initialTickers: string[] }) {
  const [tickers, setTickers] = useState<string[]>(initialTickers.slice(0, 4));
  const [concept, setConcept] = useState("NetIncomeLoss");
  const [rows, setRows] = useState<
    Array<{
      ticker: string;
      value: string;
      endDate: string | null;
      form: string | null;
    }>
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setTickers(initialTickers.slice(0, 4));
  }, [initialTickers]);

  async function runCompare() {
    setLoading(true);
    try {
      const out: typeof rows = [];
      for (const t of tickers.slice(0, 4)) {
        const res = await fetch(`/api/companies/${t}/facts/strip`);
        if (!res.ok) {
          continue;
        }
        const json = (await res.json()) as { facts: FactRow[] };
        const hit =
          json.facts.find(
            (f) => f.concept === concept && (f.form ?? "").includes("10-K"),
          ) ?? json.facts.find((f) => f.concept === concept);
        if (hit) {
          out.push({
            ticker: t,
            value: hit.value,
            endDate: hit.endDate,
            form: hit.form,
          });
        }
      }
      setRows(out);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void runCompare();
    // initial compare when peers screen opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card title="Peer metrics">
      <Typography.Paragraph type="secondary">
        Compare filed XBRL concepts across up to four companies. Each row keeps
        that filer’s own period end.
      </Typography.Paragraph>
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Select
          mode="tags"
          style={{ width: "100%" }}
          value={tickers}
          onChange={(v) => setTickers(v.slice(0, 4))}
          placeholder="Up to 4 tickers"
        />
        <Select
          style={{ width: 360 }}
          value={concept}
          onChange={setConcept}
          options={[
            { value: "NetIncomeLoss", label: "Net income" },
            { value: "OperatingIncomeLoss", label: "Operating income" },
            {
              value: "RevenueFromContractWithCustomerExcludingAssessedTax",
              label: "Revenue (contract)",
            },
            { value: "Revenues", label: "Revenues" },
            { value: "EarningsPerShareDiluted", label: "Diluted EPS" },
          ]}
        />
        <Button type="primary" loading={loading} onClick={() => void runCompare()}>
          Run comparison
        </Button>
        <Table
          rowKey="ticker"
          dataSource={rows}
          columns={[
            { title: "Ticker", dataIndex: "ticker" },
            {
              title: "Value",
              dataIndex: "value",
              render: (v: string) => formatMoney(v, "USD"),
            },
            { title: "Period end", dataIndex: "endDate" },
            { title: "Form", dataIndex: "form" },
          ]}
        />
      </Space>
    </Card>
  );
}

function ChangesScreen({
  seed,
}: {
  seed: {
    ticker: string;
    item: string;
    older?: string;
    newer?: string;
    autoRun?: boolean;
  };
}) {
  const [ticker, setTicker] = useState(seed.ticker);
  const [item, setItem] = useState(seed.item);
  const [filings, setFilings] = useState<FilingRow[]>([]);
  const [older, setOlder] = useState<string | undefined>(seed.older);
  const [newer, setNewer] = useState<string | undefined>(seed.newer);
  const [result, setResult] = useState<{
    added: string[];
    removed: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadFilings(t: string) {
    const res = await fetch(`/api/companies/${t}/filings`);
    if (!res.ok) {
      message.error("Load filings failed");
      return;
    }
    const json = (await res.json()) as { filings: FilingRow[] };
    const tens = json.filings.filter((f) => f.form.startsWith("10-K"));
    setFilings(tens);
    if (!seed.newer && tens[0]) {
      setNewer(tens[0].accessionNumber);
    }
    if (!seed.older && tens[1]) {
      setOlder(tens[1].accessionNumber);
    }
  }

  async function runDirectDiff(
    overrides?: { older?: string; newer?: string; item?: string; ticker?: string },
  ) {
    const o = overrides?.older ?? older;
    const n = overrides?.newer ?? newer;
    const it = overrides?.item ?? item;
    const tk = overrides?.ticker ?? ticker;
    if (!o || !n) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: tk,
          item: it,
          olderAccession: o,
          newerAccession: n,
        }),
      });
      if (!res.ok) {
        throw new Error(`Diff failed (${res.status})`);
      }
      const json = (await res.json()) as {
        added?: string[];
        removed?: string[];
      };
      setResult({
        added: json.added ?? [],
        removed: json.removed ?? [],
      });
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "Diff failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setTicker(seed.ticker);
    setItem(seed.item);
    setOlder(seed.older);
    setNewer(seed.newer);
    void loadFilings(seed.ticker).then(() => {
      if (seed.autoRun && seed.older && seed.newer) {
        void runDirectDiff({
          older: seed.older,
          newer: seed.newer,
          item: seed.item,
          ticker: seed.ticker,
        });
      }
    });
    // intentionally seed-driven
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  return (
    <Card title="Filing changes">
      <Typography.Paragraph type="secondary">
        Compare the same section across two 10-Ks. Use this after a research
        brief to see what Risk Factors or MD&A language changed.
      </Typography.Paragraph>
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Form layout="inline">
          <Form.Item label="Ticker">
            <Input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onBlur={() => void loadFilings(ticker)}
              style={{ width: 100 }}
            />
          </Form.Item>
          <Form.Item label="Item">
            <Select
              value={item}
              onChange={setItem}
              style={{ width: 180 }}
              options={[
                { value: "1A", label: "1A Risk Factors" },
                { value: "7", label: "7 MD&A" },
                { value: "1", label: "1 Business" },
              ]}
            />
          </Form.Item>
        </Form>
        <Space wrap>
          <Select
            style={{ width: 300 }}
            placeholder="Older 10-K"
            value={older}
            onChange={setOlder}
            options={filings.map((f) => ({
              value: f.accessionNumber,
              label: `${f.filingDate} ${f.form}`,
            }))}
          />
          <Select
            style={{ width: 300 }}
            placeholder="Newer 10-K"
            value={newer}
            onChange={setNewer}
            options={filings.map((f) => ({
              value: f.accessionNumber,
              label: `${f.filingDate} ${f.form}`,
            }))}
          />
          <Button
            type="primary"
            loading={loading}
            onClick={() => void runDirectDiff()}
          >
            Diff sections
          </Button>
        </Space>
        {result ? (
          <Collapse
            defaultActiveKey={["added", "removed"]}
            items={[
              {
                key: "added",
                label: `Appeared in newer filing (${result.added.length})`,
                children: result.added.map((q, i) => (
                  <Typography.Paragraph key={i}>{q}</Typography.Paragraph>
                )),
              },
              {
                key: "removed",
                label: `Dropped from newer filing (${result.removed.length})`,
                children: result.removed.map((q, i) => (
                  <Typography.Paragraph key={i}>{q}</Typography.Paragraph>
                )),
              },
            ]}
          />
        ) : null}
      </Space>
    </Card>
  );
}

function EvalsScreen() {
  const [summary, setSummary] = useState({
    cases: 0,
    runs: 0,
    passed: 0,
    failed: 0,
  });
  const [runs, setRuns] = useState<
    Array<{
      id: string;
      ticker: string;
      question: string;
      passed: boolean;
      answer: string;
      createdAt: string;
    }>
  >([]);

  useEffect(() => {
    void fetch("/api/evals")
      .then((r) => r.json())
      .then(
        (json: {
          summary: typeof summary;
          runs: typeof runs;
        }) => {
          setSummary(json.summary);
          setRuns(json.runs);
        },
      );
  }, []);

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="large">
      <Typography.Paragraph type="secondary">
        Faithfulness checks for the research agent: numbers must match XBRL;
        quotes must appear in stored sections.
      </Typography.Paragraph>
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic title="Cases" value={summary.cases} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Runs" value={summary.runs} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Passed" value={summary.passed} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Failed" value={summary.failed} />
          </Card>
        </Col>
      </Row>
      <Card title="Latest eval runs">
        <Typography.Paragraph type="secondary">
          Run <Typography.Text code>pnpm eval</Typography.Text> after ingest.
        </Typography.Paragraph>
        <Table
          rowKey="id"
          dataSource={runs}
          columns={[
            {
              title: "Pass",
              dataIndex: "passed",
              render: (v: boolean) => (
                <Tag color={v ? "success" : "error"}>{v ? "yes" : "no"}</Tag>
              ),
              width: 80,
            },
            { title: "Ticker", dataIndex: "ticker", width: 90 },
            { title: "Question", dataIndex: "question" },
            { title: "Answer", dataIndex: "answer", ellipsis: true },
          ]}
        />
      </Card>
    </Space>
  );
}
