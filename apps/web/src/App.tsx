import {
  Alert,
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
import { Bubble, Sender, ThoughtChain, XProvider } from "@ant-design/x";
import { useCallback, useEffect, useMemo, useState } from "react";

const { Header, Sider, Content } = Layout;

type SectionKey = "overview" | "company" | "compare" | "changes" | "evals";

type Health = { ok: boolean; service: string };
type Company = { ticker: string; name: string; cik: string };
type FactRow = {
  concept: string;
  value: string;
  unit: string;
  endDate: string | null;
  form: string | null;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
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

const roles = {
  assistant: { placement: "start" as const },
  user: { placement: "end" as const },
};

function formatMoney(value: string, unit: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return value;
  }
  if (unit === "USD" || unit === "USD/shares") {
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export default function App() {
  const [section, setSection] = useState<SectionKey>("company");
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <Sider breakpoint="lg" collapsedWidth={0} theme="light" width={220}>
          <Flex align="center" style={{ height: 64, paddingInline: 24 }}>
            <Typography.Text strong>Filing Desk</Typography.Text>
          </Flex>
          <Menu
            mode="inline"
            selectedKeys={[section]}
            items={[
              { key: "overview", label: "Overview" },
              { key: "company", label: "Company" },
              { key: "compare", label: "Compare" },
              { key: "changes", label: "Changes" },
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
              justifyContent: "flex-end",
              paddingInline: 24,
            }}
          >
            {health ? (
              <Tag color="success">{health.service}</Tag>
            ) : (
              <Tag color={error ? "error" : "processing"}>
                {error ?? "Checking API"}
              </Tag>
            )}
          </Header>
          <Content style={{ margin: 24 }}>
            {section === "overview" && <Overview error={error} />}
            {section === "company" && <CompanyScreen />}
            {section === "compare" && <CompareScreen />}
            {section === "changes" && <ChangesScreen />}
            {section === "evals" && <EvalsScreen />}
          </Content>
        </Layout>
      </Layout>
    </XProvider>
  );
}

function Overview({ error }: { error: string | null }) {
  return (
    <Card>
      <Typography.Title level={2}>Filing Desk</Typography.Title>
      <Typography.Paragraph>
        Answers about public companies come from their own SEC filings. Figures
        come from XBRL facts. Narrative answers quote the filing and link back
        to EDGAR.
      </Typography.Paragraph>
      {error ? (
        <Alert
          type="error"
          showIcon
          message="The API is not reachable"
          description="Start it with pnpm dev:api. Vite proxies /api to port 4000."
        />
      ) : (
        <Alert
          type="info"
          showIcon
          message="Ingest a ticker before chatting"
          description="pnpm ingest -- NVDA"
        />
      )}
    </Card>
  );
}

function CompanyScreen() {
  const [query, setQuery] = useState("NVDA");
  const [company, setCompany] = useState<Company & { filingCount?: number } | null>(
    null,
  );
  const [strip, setStrip] = useState<FactRow[]>([]);
  const [filings, setFilings] = useState<FilingRow[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [traces, setTraces] = useState<TraceRow[]>([]);

  const loadCompany = useCallback(async (ticker: string) => {
    const t = ticker.trim().toUpperCase();
    if (!t) {
      return;
    }
    const [cRes, sRes, fRes] = await Promise.all([
      fetch(`/api/companies/${t}`),
      fetch(`/api/companies/${t}/facts/strip`),
      fetch(`/api/companies/${t}/filings`),
    ]);
    if (!cRes.ok) {
      message.error(`Company ${t} not found. Run pnpm ingest -- ${t}`);
      return;
    }
    const cJson = (await cRes.json()) as { company: Company & { filingCount: number } };
    const sJson = (await sRes.json()) as { facts: FactRow[] };
    const fJson = (await fRes.json()) as { filings: FilingRow[] };
    setCompany(cJson.company);
    setStrip(sJson.facts);
    setFilings(fJson.filings);
    setMessages([]);
    setConversationId(null);
    setTraces([]);
  }, []);

  useEffect(() => {
    void loadCompany("NVDA");
  }, [loadCompany]);

  const stripStats = useMemo(() => {
    const pick = (concepts: string[]) =>
      strip.find((f) => concepts.includes(f.concept) && (f.form ?? "").includes("10-K")) ??
      strip.find((f) => concepts.includes(f.concept));
    return [
      {
        title: "Revenue",
        fact: pick([
          "Revenues",
          "RevenueFromContractWithCustomerExcludingAssessedTax",
          "SalesRevenueNet",
        ]),
      },
      { title: "Operating income", fact: pick(["OperatingIncomeLoss"]) },
      { title: "Net income", fact: pick(["NetIncomeLoss"]) },
      { title: "Diluted EPS", fact: pick(["EarningsPerShareDiluted"]) },
    ];
  }, [strip]);

  async function sendChat(text: string) {
    if (!company || !text.trim()) {
      return;
    }
    const userMsg: ChatMessage = {
      key: `u-${Date.now()}`,
      role: "user",
      content: text.trim(),
    };
    const next = [...messages, userMsg];
    setMessages([...next, { key: `a-${Date.now()}`, role: "assistant", content: "", loading: true }]);
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
      const newConversationId = res.headers.get("X-Conversation-Id") ?? conversationId;
      if (newConversationId) {
        setConversationId(newConversationId);
      }
      if (!res.ok || !res.body) {
        throw new Error(`Chat failed (${res.status})`);
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
            const delta = event.delta ?? event.textDelta;
            if (typeof delta === "string") {
              assistant += delta;
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === "assistant") {
                  copy[copy.length - 1] = {
                    ...last,
                    content: assistant,
                    loading: true,
                  };
                }
                return copy;
              });
            }
          } catch {
            // ignore partial JSON
          }
        }
      }

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
        const tRes = await fetch(`/api/conversations/${newConversationId}/traces`);
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

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card>
        <Space wrap>
          <Input.Search
            placeholder="Ticker"
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            onSearch={(v) => void loadCompany(v)}
            enterButton="Load"
            style={{ width: 280 }}
          />
          {company ? (
            <Typography.Text>
              {company.name} · CIK {company.cik} · {company.filingCount ?? "?"}{" "}
              filings
            </Typography.Text>
          ) : null}
        </Space>
      </Card>

      <Row gutter={16}>
        {stripStats.map((s) => (
          <Col xs={12} md={6} key={s.title}>
            <Card>
              <Statistic
                title={s.title}
                value={
                  s.fact
                    ? formatMoney(s.fact.value, s.fact.unit)
                    : "—"
                }
                suffix={s.fact?.unit === "USD" ? "" : s.fact?.unit}
              />
              <Typography.Text type="secondary">
                {s.fact?.endDate ?? "No XBRL yet"}
              </Typography.Text>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={16}>
        <Col xs={24} lg={14}>
          <Card title="Ask" styles={{ body: { minHeight: 420 } }}>
            <Bubble.List
              style={{ height: 320, overflow: "auto", marginBottom: 12 }}
              role={roles}
              items={messages.map((m) => ({
                key: m.key,
                role: m.role,
                content: m.content,
                loading: m.loading,
              }))}
            />
            <Sender
              value={input}
              loading={loading}
              onChange={setInput}
              onSubmit={(v) => void sendChat(v)}
              placeholder="Ask about this company…"
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Trace" style={{ marginBottom: 16 }}>
            {traces.length === 0 ? (
              <Typography.Text type="secondary">Tool steps appear here.</Typography.Text>
            ) : (
              <ThoughtChain
                items={traces.map((t) => ({
                  key: t.id,
                  title: t.toolName,
                  description: (
                    <Typography.Paragraph
                      ellipsis={{ rows: 4, expandable: true }}
                      style={{ marginBottom: 0, fontSize: 12 }}
                    >
                      {JSON.stringify({ input: t.input, output: t.output }, null, 2)}
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
              pagination={{ pageSize: 6 }}
              dataSource={filings}
              columns={[
                { title: "Form", dataIndex: "form", width: 90 },
                { title: "Filed", dataIndex: "filingDate", width: 110 },
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
    </Space>
  );
}

function CompareScreen() {
  const [tickers, setTickers] = useState<string[]>(["NVDA", "AMD"]);
  const [concept, setConcept] = useState("NetIncomeLoss");
  const [rows, setRows] = useState<
    Array<{ ticker: string; value: string; endDate: string | null; form: string | null }>
  >([]);
  const [loading, setLoading] = useState(false);

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

  return (
    <Card title="Compare peers">
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Select
          mode="tags"
          style={{ width: "100%" }}
          value={tickers}
          onChange={(v) => setTickers(v.slice(0, 4))}
          placeholder="Up to 4 tickers"
        />
        <Select
          style={{ width: 320 }}
          value={concept}
          onChange={setConcept}
          options={[
            { value: "NetIncomeLoss", label: "NetIncomeLoss" },
            { value: "OperatingIncomeLoss", label: "OperatingIncomeLoss" },
            {
              value: "RevenueFromContractWithCustomerExcludingAssessedTax",
              label: "Revenue (contract)",
            },
            { value: "Revenues", label: "Revenues" },
            { value: "EarningsPerShareDiluted", label: "Diluted EPS" },
          ]}
        />
        <Sender
          readOnly
          value={`Compare ${concept}`}
          loading={loading}
          onSubmit={() => void runCompare()}
          placeholder="Click send to compare"
        />
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

function ChangesScreen() {
  const [ticker, setTicker] = useState("NVDA");
  const [item, setItem] = useState("1A");
  const [filings, setFilings] = useState<FilingRow[]>([]);
  const [older, setOlder] = useState<string>();
  const [newer, setNewer] = useState<string>();
  const [result, setResult] = useState<{
    added: string[];
    removed: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadFilings(t: string) {
    const res = await fetch(`/api/companies/${t}/filings?form=10-K`);
    if (!res.ok) {
      message.error("Load filings failed");
      return;
    }
    const json = (await res.json()) as { filings: FilingRow[] };
    const tens = json.filings.filter((f) => f.form.startsWith("10-K"));
    setFilings(tens);
    if (tens[0]) {
      setNewer(tens[0].accessionNumber);
    }
    if (tens[1]) {
      setOlder(tens[1].accessionNumber);
    }
  }

  useEffect(() => {
    void loadFilings(ticker);
  }, [ticker]);

  async function runDirectDiff() {
    if (!older || !newer) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          item,
          olderAccession: older,
          newerAccession: newer,
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

  return (
    <Card title="Section changes">
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
              style={{ width: 160 }}
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
            style={{ width: 280 }}
            placeholder="Older accession"
            value={older}
            onChange={setOlder}
            options={filings.map((f) => ({
              value: f.accessionNumber,
              label: `${f.filingDate} ${f.form}`,
            }))}
          />
          <Select
            style={{ width: 280 }}
            placeholder="Newer accession"
            value={newer}
            onChange={setNewer}
            options={filings.map((f) => ({
              value: f.accessionNumber,
              label: `${f.filingDate} ${f.form}`,
            }))}
          />
          <Sender
            readOnly
            loading={loading}
            value="Diff sections"
            onSubmit={() => void runDirectDiff()}
          />
        </Space>
        {result ? (
          <Collapse
            items={[
              {
                key: "added",
                label: `Added (${result.added.length})`,
                children: result.added.map((q, i) => (
                  <Typography.Paragraph key={i}>{q}</Typography.Paragraph>
                )),
              },
              {
                key: "removed",
                label: `Removed (${result.removed.length})`,
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
            {
              title: "Answer",
              dataIndex: "answer",
              ellipsis: true,
            },
          ]}
        />
      </Card>
    </Space>
  );
}
