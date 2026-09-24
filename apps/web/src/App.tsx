import {
  Alert,
  Card,
  Flex,
  Layout,
  Menu,
  Tag,
  Typography,
} from "antd";
import { useEffect, useState } from "react";

const { Header, Sider, Content } = Layout;

type Health = {
  ok: boolean;
  service: string;
};

type SectionKey = "overview" | "company" | "compare" | "changes" | "evals";

const sections: Record<
  SectionKey,
  { title: string; description: string }
> = {
  overview: {
    title: "Filing Desk",
    description:
      "Answers about public companies come from their own SEC filings. Figures come from XBRL facts. Narrative answers quote the filing and link back to EDGAR.",
  },
  company: {
    title: "Company",
    description:
      "Search a ticker, read the financial strip, and ask a question. The trace shows which filings, facts, and passages the agent used.",
  },
  compare: {
    title: "Compare",
    description:
      "Compare up to four filers. Metrics stay on each company’s own fiscal calendar. Narrative claims are cited per company.",
  },
  changes: {
    title: "Changes",
    description:
      "Pick two filings and a section. The brief quotes what was added, removed, or materially reworded.",
  },
  evals: {
    title: "Evals",
    description:
      "A fixed set of questions is scored against saved filings: each number must match an XBRL fact, and each qualitative claim must have a quote.",
  },
};

export default function App() {
  const [section, setSection] = useState<SectionKey>("overview");
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const page = sections[section];

  useEffect(() => {
    fetch("/api/health")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }
        return response.json() as Promise<Health>;
      })
      .then(setHealth)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "API unreachable");
      });
  }, []);

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider breakpoint="lg" collapsedWidth={0} theme="light">
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
          <Card>
            <Typography.Title level={2}>{page.title}</Typography.Title>
            <Typography.Paragraph>{page.description}</Typography.Paragraph>
            {section === "overview" && error ? (
              <Alert
                type="error"
                showIcon
                message="The API is not reachable"
                description="Start it with pnpm dev:api. The Vite dev server proxies /api to port 4000."
              />
            ) : null}
          </Card>
        </Content>
      </Layout>
    </Layout>
  );
}
