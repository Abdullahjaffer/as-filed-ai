import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  Drawer,
  Flex,
  Form,
  Input,
  Layout,
  Menu,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
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

type SectionKey = "research" | "filings" | "matrix" | "peers" | "changes" | "evals";

const FORM_OPTIONS = [
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

const SECTION_ITEM_OPTIONS = [
  { value: "1A", label: "1A Risk Factors" },
  { value: "1", label: "1 Business" },
  { value: "7", label: "7 MD&A" },
  { value: "2", label: "2 MD&A (10-Q)" },
  { value: "8K", label: "8-K body" },
  { value: "PROXY", label: "Proxy" },
];

const YEAR_OPTIONS = Array.from({ length: 15 }, (_, i) => {
  const y = String(2026 - i);
  return { value: y, label: y };
});

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
type SearchResultRow = {
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
  snippet?: string | null;
  hasText?: boolean;
};
type FilingDetail = {
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
  sections: Array<{ id: string; item: string; title: string }>;
  documents: Array<{
    id: string;
    kind: string;
    documentType: string;
    filename: string;
  }>;
};
type MatrixCell = {
  ticker: string;
  name: string | null;
  sectionId: string | null;
  accessionNumber: string | null;
  form: string | null;
  filingDate: string | null;
  filingUrl: string | null;
  title: string | null;
  snippet: string | null;
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
  const [docAccession, setDocAccession] = useState<string | null>(null);
  const [docFocusSectionId, setDocFocusSectionId] = useState<string | null>(
    null,
  );
  const [changeSeed, setChangeSeed] = useState<{
    ticker: string;
    item: string;
    older?: string;
    newer?: string;
    autoRun?: boolean;
  }>({ ticker: "NVDA", item: "1A" });

  function openDocument(accession: string, sectionId?: string | null) {
    setDocAccession(accession);
    setDocFocusSectionId(sectionId ?? null);
  }

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
        <Sider theme="light" width={228} style={{ position: "sticky", top: 0, height: "100vh", overflow: "auto" }}>
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
              { key: "filings", label: "Filings" },
              { key: "matrix", label: "Section matrix" },
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
                onOpenDocument={openDocument}
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
            {section === "filings" && (
              <FilingsScreen
                onOpenDocument={openDocument}
                onOpenPeers={(tickers) => {
                  setPeerSeed(tickers);
                  setSection("peers");
                }}
              />
            )}
            {section === "matrix" && (
              <MatrixScreen onOpenDocument={openDocument} />
            )}
            {section === "peers" && (
              <CompareScreen initialTickers={peerSeed} />
            )}
            {section === "changes" && (
              <ChangesScreen seed={changeSeed} />
            )}
            {section === "evals" && <EvalsScreen />}
            <DocumentDrawer
              accession={docAccession}
              focusSectionId={docFocusSectionId}
              onClose={() => {
                setDocAccession(null);
                setDocFocusSectionId(null);
              }}
              onOpenPeers={(tickers) => {
                setPeerSeed(tickers);
                setSection("peers");
                setDocAccession(null);
              }}
              onOpenChanges={(seed) => {
                setChangeSeed({ ...seed, autoRun: true });
                setSection("changes");
                setDocAccession(null);
              }}
            />
          </Content>
        </Layout>
      </Layout>
    </XProvider>
  );
}

function ResearchScreen({
  ticker,
  onTicker,
  onOpenDocument,
  onOpenPeers,
  onOpenChanges,
}: {
  ticker: string;
  onTicker: (t: string) => void;
  onOpenDocument: (accession: string, sectionId?: string | null) => void;
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
                  <Tag
                    style={{ cursor: "pointer" }}
                    onClick={() =>
                      onOpenDocument(brief.latest.tenK!.accessionNumber)
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
                      onOpenDocument(brief.latest.tenQ!.accessionNumber)
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
                      onOpenDocument(brief.latest.eightK!.accessionNumber)
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
                            onClick: () => onOpenDocument(row.accessionNumber),
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
                                    onOpenDocument(row.accessionNumber);
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

function FilingsScreen({
  onOpenDocument,
  onOpenPeers,
}: {
  onOpenDocument: (accession: string, sectionId?: string | null) => void;
  onOpenPeers: (tickers: string[]) => void;
}) {
  const [companiesList, setCompaniesList] = useState<Company[]>([]);
  const [ticker, setTicker] = useState<string | undefined>(undefined);
  const [form, setForm] = useState<string | undefined>(undefined);
  const [year, setYear] = useState<string | undefined>(undefined);
  const [item, setItem] = useState<string | undefined>(undefined);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [mode, setMode] = useState<string>("index");
  const [rows, setRows] = useState<SearchResultRow[]>([]);
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
  }, [ticker, form, year, item, keyword]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

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
                onChange={setForm}
                options={FORM_OPTIONS}
              />
            </div>
            <div>
              <Typography.Text type="secondary">Year</Typography.Text>
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
                style={{ width: "100%", marginTop: 4 }}
                placeholder="Any parsed section"
                value={item}
                onChange={setItem}
                options={SECTION_ITEM_OPTIONS}
              />
            </div>
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
                  onOpenPeers([
                    ticker,
                    ...companiesList
                      .map((c) => c.ticker)
                      .filter((t) => t !== ticker)
                      .slice(0, 3),
                  ])
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
          <Table
            size="small"
            rowKey={(r) =>
              `${r.accessionNumber}-${r.chunkId ?? r.sectionId ?? "index"}`
            }
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
                onOpenDocument(record.accessionNumber, record.sectionId),
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
                title: "Item",
                dataIndex: "item",
                width: 70,
                render: (v: string | null | undefined) => v ?? "—",
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

function DocumentDrawer({
  accession,
  focusSectionId,
  onClose,
  onOpenPeers,
  onOpenChanges,
}: {
  accession: string | null;
  focusSectionId: string | null;
  onClose: () => void;
  onOpenPeers: (tickers: string[]) => void;
  onOpenChanges: (seed: {
    ticker: string;
    item: string;
    older?: string;
    newer?: string;
  }) => void;
}) {
  const [detail, setDetail] = useState<FilingDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [sectionBody, setSectionBody] = useState<string | null>(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [docBody, setDocBody] = useState<string | null>(null);
  const [bodyLoading, setBodyLoading] = useState(false);

  useEffect(() => {
    if (!accession) {
      setDetail(null);
      setActiveSectionId(null);
      setSectionBody(null);
      setActiveDocId(null);
      setDocBody(null);
      return;
    }
    setLoading(true);
    void fetch(`/api/filings/${encodeURIComponent(accession)}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Filing load failed (${res.status})`);
        }
        return (await res.json()) as FilingDetail;
      })
      .then((json) => {
        setDetail(json);
        const prefer =
          focusSectionId &&
          json.sections.some((s) => s.id === focusSectionId)
            ? focusSectionId
            : (json.sections[0]?.id ?? null);
        setActiveSectionId(prefer);
        setActiveDocId(null);
        setDocBody(null);
      })
      .catch((cause: unknown) => {
        message.error(
          cause instanceof Error ? cause.message : "Filing load failed",
        );
      })
      .finally(() => setLoading(false));
  }, [accession, focusSectionId]);

  useEffect(() => {
    if (!activeSectionId) {
      setSectionBody(null);
      return;
    }
    setBodyLoading(true);
    void fetch(`/api/sections/${activeSectionId}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Section load failed");
        }
        return (await res.json()) as { section: { body: string } };
      })
      .then((json) => setSectionBody(json.section.body))
      .catch(() => setSectionBody(null))
      .finally(() => setBodyLoading(false));
  }, [activeSectionId]);

  async function loadDocument(id: string) {
    setActiveDocId(id);
    setBodyLoading(true);
    try {
      const res = await fetch(`/api/documents/${id}`);
      if (!res.ok) {
        throw new Error("Document load failed");
      }
      const json = (await res.json()) as { document: { content: string } };
      setDocBody(json.document.content);
    } catch (cause) {
      message.error(
        cause instanceof Error ? cause.message : "Document load failed",
      );
      setDocBody(null);
    } finally {
      setBodyLoading(false);
    }
  }

  const activeSection = detail?.sections.find((s) => s.id === activeSectionId);
  const exhibits =
    detail?.documents.filter((d) => d.kind === "exhibit") ?? [];
  const primaryDocs =
    detail?.documents.filter((d) => d.kind !== "exhibit") ?? [];

  return (
    <Drawer
      width={720}
      open={Boolean(accession)}
      onClose={onClose}
      title={
        detail
          ? `${detail.filing.ticker} · ${detail.filing.form} · ${detail.filing.filingDate}`
          : "Filing"
      }
      extra={
        detail ? (
          <Space>
            <Button
              onClick={() =>
                onOpenPeers([
                  detail.filing.ticker,
                  "AAPL",
                  "AMD",
                  "MSFT",
                  "NVDA",
                ]
                  .filter((t, i, arr) => arr.indexOf(t) === i)
                  .slice(0, 4))
              }
            >
              Peer metrics
            </Button>
            <Button
              type="primary"
              disabled={!activeSection}
              onClick={() => {
                if (!detail || !activeSection) {
                  return;
                }
                void (async () => {
                  let older: string | undefined;
                  try {
                    const res = await fetch(
                      `/api/companies/${detail.filing.ticker}/filings`,
                    );
                    if (res.ok) {
                      const json = (await res.json()) as {
                        filings: FilingRow[];
                      };
                      const prior = json.filings.filter(
                        (f) =>
                          f.accessionNumber !==
                            detail.filing.accessionNumber &&
                          f.filingDate <= detail.filing.filingDate,
                      );
                      const prefer =
                        prior.find((f) => f.form.startsWith("10-K")) ??
                        prior.find((f) => f.form.startsWith("10-Q")) ??
                        prior[0];
                      older = prefer?.accessionNumber;
                    }
                  } catch {
                    // optional older
                  }
                  onOpenChanges({
                    ticker: detail.filing.ticker,
                    item: activeSection.item,
                    newer: detail.filing.accessionNumber,
                    older,
                  });
                })();
              }}
            >
              Diff this section
            </Button>
          </Space>
        ) : null
      }
    >
      {loading || !detail ? (
        <Spin />
      ) : (
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <div>
            <Typography.Text strong>{detail.filing.name}</Typography.Text>
            <br />
            <Typography.Text type="secondary">
              CIK {detail.filing.cik}
              {detail.filing.sicDescription
                ? ` · ${detail.filing.sicDescription}`
                : ""}
            </Typography.Text>
            <br />
            <a href={detail.filing.filingUrl} target="_blank" rel="noreferrer">
              Open on EDGAR
            </a>
          </div>
          <Tabs
            items={[
              {
                key: "sections",
                label: `Sections (${detail.sections.length})`,
                children:
                  detail.sections.length === 0 ? (
                    <Typography.Text type="secondary">
                      No parsed sections for this filing. Index-only rows and
                      some forms have no stored narrative.
                    </Typography.Text>
                  ) : (
                    <Space
                      direction="vertical"
                      style={{ width: "100%" }}
                      size="middle"
                    >
                      <Select
                        style={{ width: "100%" }}
                        value={activeSectionId ?? undefined}
                        onChange={setActiveSectionId}
                        options={detail.sections.map((s) => ({
                          value: s.id,
                          label: `Item ${s.item} · ${s.title}`,
                        }))}
                      />
                      {bodyLoading && !docBody ? (
                        <Spin />
                      ) : (
                        <Typography.Paragraph
                          style={{
                            whiteSpace: "pre-wrap",
                            maxHeight: "60vh",
                            overflow: "auto",
                          }}
                        >
                          {sectionBody ?? "No body"}
                        </Typography.Paragraph>
                      )}
                    </Space>
                  ),
              },
              {
                key: "exhibits",
                label: `Exhibits (${exhibits.length})`,
                children:
                  exhibits.length === 0 ? (
                    <Typography.Text type="secondary">
                      No EX-99 exhibits stored for this accession.
                    </Typography.Text>
                  ) : (
                    <Space
                      direction="vertical"
                      style={{ width: "100%" }}
                      size="middle"
                    >
                      {exhibits.map((d) => (
                        <Button
                          key={d.id}
                          type={activeDocId === d.id ? "primary" : "default"}
                          onClick={() => void loadDocument(d.id)}
                        >
                          {d.documentType} · {d.filename}
                        </Button>
                      ))}
                      {activeDocId ? (
                        bodyLoading ? (
                          <Spin />
                        ) : (
                          <Typography.Paragraph
                            style={{
                              whiteSpace: "pre-wrap",
                              maxHeight: "50vh",
                              overflow: "auto",
                            }}
                          >
                            {(docBody ?? "").slice(0, 80_000)}
                          </Typography.Paragraph>
                        )
                      ) : null}
                    </Space>
                  ),
              },
              {
                key: "primary",
                label: `Documents (${primaryDocs.length})`,
                children:
                  primaryDocs.length === 0 ? (
                    <Typography.Text type="secondary">
                      No primary document text stored.
                    </Typography.Text>
                  ) : (
                    <Space
                      direction="vertical"
                      style={{ width: "100%" }}
                      size="middle"
                    >
                      {primaryDocs.map((d) => (
                        <Button
                          key={d.id}
                          type={activeDocId === d.id ? "primary" : "default"}
                          onClick={() => void loadDocument(d.id)}
                        >
                          {d.documentType} · {d.filename}
                        </Button>
                      ))}
                      {activeDocId &&
                      primaryDocs.some((d) => d.id === activeDocId) ? (
                        bodyLoading ? (
                          <Spin />
                        ) : (
                          <Typography.Paragraph
                            style={{
                              whiteSpace: "pre-wrap",
                              maxHeight: "50vh",
                              overflow: "auto",
                            }}
                          >
                            {(docBody ?? "").slice(0, 80_000)}
                          </Typography.Paragraph>
                        )
                      ) : null}
                    </Space>
                  ),
              },
            ]}
          />
        </Space>
      )}
    </Drawer>
  );
}

function MatrixScreen({
  onOpenDocument,
}: {
  onOpenDocument: (accession: string, sectionId?: string | null) => void;
}) {
  const [item, setItem] = useState("1A");
  const [tickers, setTickers] = useState<string[]>([
    "NVDA",
    "AAPL",
    "AMD",
    "MSFT",
  ]);
  const [watchlist, setWatchlist] = useState<Company[]>([]);
  const [cells, setCells] = useState<MatrixCell[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetch("/api/companies")
      .then((r) => r.json())
      .then((json: { companies: Company[] }) => setWatchlist(json.companies));
  }, []);

  const load = useCallback(async (nextItem: string, nextTickers: string[]) => {
    if (nextTickers.length === 0) {
      setCells([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/matrix?item=${encodeURIComponent(nextItem)}&tickers=${encodeURIComponent(nextTickers.join(","))}`,
      );
      if (!res.ok) {
        throw new Error(`Matrix failed (${res.status})`);
      }
      const json = (await res.json()) as { cells: MatrixCell[] };
      setCells(json.cells);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "Matrix failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(item, tickers);
  }, [item, tickers, load]);

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card>
        <Flex justify="space-between" align="flex-start" wrap gap={12}>
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              Section matrix
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Latest stored section per company. Empty cells mean that item was
              never parsed for the ticker (common for Item 1 and Item 7).
            </Typography.Paragraph>
          </div>
          <Space wrap>
            <Select
              style={{ width: 220 }}
              value={item}
              onChange={setItem}
              options={SECTION_ITEM_OPTIONS}
            />
            <Select
              mode="multiple"
              style={{ minWidth: 280 }}
              placeholder="Tickers"
              value={tickers}
              onChange={(v) => setTickers(v.slice(0, 8))}
              options={watchlist.map((c) => ({
                value: c.ticker,
                label: c.ticker,
              }))}
            />
          </Space>
        </Flex>
      </Card>
      <Spin spinning={loading}>
        <Row gutter={16}>
          {cells.map((cell) => (
            <Col xs={24} md={12} xl={6} key={cell.ticker}>
              <Card
                size="small"
                title={`${cell.ticker}${cell.name ? ` · ${cell.name}` : ""}`}
                extra={
                  cell.accessionNumber ? (
                    <Button
                      type="link"
                      size="small"
                      onClick={() =>
                        onOpenDocument(
                          cell.accessionNumber!,
                          cell.sectionId,
                        )
                      }
                    >
                      Open
                    </Button>
                  ) : null
                }
                onClick={() => {
                  if (cell.accessionNumber) {
                    onOpenDocument(cell.accessionNumber, cell.sectionId);
                  }
                }}
                style={{
                  cursor: cell.accessionNumber ? "pointer" : "default",
                  minHeight: 220,
                }}
              >
                {cell.snippet ? (
                  <>
                    <Space wrap style={{ marginBottom: 8 }}>
                      <Tag>{cell.form}</Tag>
                      <Tag>{cell.filingDate}</Tag>
                      <Tag>{cell.title}</Tag>
                    </Space>
                    <Typography.Paragraph
                      ellipsis={{ rows: 8, expandable: true }}
                      style={{ marginBottom: 0 }}
                    >
                      {cell.snippet}
                    </Typography.Paragraph>
                  </>
                ) : (
                  <Typography.Text type="secondary">
                    No stored Item {item} section for {cell.ticker}
                  </Typography.Text>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      </Spin>
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

  async function loadFilings(t: string, preferOlder?: string, preferNewer?: string) {
    const res = await fetch(`/api/companies/${t}/filings`);
    if (!res.ok) {
      message.error("Load filings failed");
      return;
    }
    const json = (await res.json()) as { filings: FilingRow[] };
    const narrative = json.filings.filter(
      (f) =>
        f.form.startsWith("10-K") ||
        f.form.startsWith("10-Q") ||
        f.form.startsWith("8-K") ||
        f.form.startsWith("DEF"),
    );
    setFilings(narrative);

    const nextNewer = preferNewer ?? newer ?? narrative[0]?.accessionNumber;
    const nextOlder =
      preferOlder ??
      older ??
      narrative.find((f) => f.accessionNumber !== nextNewer)?.accessionNumber;
    if (!preferNewer && !newer && narrative[0]) {
      setNewer(narrative[0].accessionNumber);
    }
    if (!preferOlder && !older && nextOlder) {
      setOlder(nextOlder);
    }
    return { older: preferOlder ?? nextOlder, newer: preferNewer ?? nextNewer };
  }

  async function runDirectDiff(
    overrides?: { older?: string; newer?: string; item?: string; ticker?: string },
  ) {
    const o = overrides?.older ?? older;
    const n = overrides?.newer ?? newer;
    const it = overrides?.item ?? item;
    const tk = overrides?.ticker ?? ticker;
    if (!o || !n) {
      message.warning("Pick an older and newer filing to diff");
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
        older?: { error?: string };
        newer?: { error?: string };
      };
      if (json.older && "error" in json.older) {
        message.error(`Older filing: ${json.older.error}`);
      }
      if (json.newer && "error" in json.newer) {
        message.error(`Newer filing: ${json.newer.error}`);
      }
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
    setResult(null);
    void loadFilings(seed.ticker, seed.older, seed.newer).then((picked) => {
      if (seed.autoRun && picked?.older && picked?.newer) {
        void runDirectDiff({
          older: picked.older,
          newer: picked.newer,
          item: seed.item,
          ticker: seed.ticker,
        });
      }
    });
    // intentionally seed-driven
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const filingOptions = useMemo(() => {
    const byAcc = new Map(filings.map((f) => [f.accessionNumber, f]));
    for (const acc of [older, newer]) {
      if (acc && !byAcc.has(acc)) {
        byAcc.set(acc, {
          accessionNumber: acc,
          form: "seeded",
          filingDate: "",
          filingUrl: "",
        });
      }
    }
    return [...byAcc.values()].map((f) => ({
      value: f.accessionNumber,
      label: f.filingDate
        ? `${f.filingDate} ${f.form}`
        : `${f.form} ${f.accessionNumber}`,
    }));
  }, [filings, older, newer]);

  return (
    <Card title="Filing changes">
      <Typography.Paragraph type="secondary">
        Compare the same section across two filings. Use this after a research
        brief or document view to see what Risk Factors or MD&A language changed.
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
              style={{ width: 200 }}
              options={SECTION_ITEM_OPTIONS}
            />
          </Form.Item>
        </Form>
        <Space wrap>
          <Select
            style={{ width: 300 }}
            placeholder="Older filing"
            value={older}
            onChange={setOlder}
            options={filingOptions}
          />
          <Select
            style={{ width: 300 }}
            placeholder="Newer filing"
            value={newer}
            onChange={setNewer}
            options={filingOptions}
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
                children:
                  result.added.length === 0 ? (
                    <Typography.Text type="secondary">
                      No added passages (section may be missing on one side).
                    </Typography.Text>
                  ) : (
                    result.added.map((q, i) => (
                      <Typography.Paragraph key={i}>{q}</Typography.Paragraph>
                    ))
                  ),
              },
              {
                key: "removed",
                label: `Dropped from newer filing (${result.removed.length})`,
                children:
                  result.removed.length === 0 ? (
                    <Typography.Text type="secondary">
                      No removed passages.
                    </Typography.Text>
                  ) : (
                    result.removed.map((q, i) => (
                      <Typography.Paragraph key={i}>{q}</Typography.Paragraph>
                    ))
                  ),
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
