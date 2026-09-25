import { Card, Col, Row, Space, Statistic, Table, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

export function Component() {
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
