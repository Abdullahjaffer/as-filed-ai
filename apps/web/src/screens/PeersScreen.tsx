import { Button, Card, Select, Space, Table, Typography } from "antd";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { formatMoney } from "../format.ts";
import { parseList } from "../paths.ts";
import type { FactRow } from "../types.ts";

export function Component() {
  const [params] = useSearchParams();
  const tickerKey = params.get("tickers") ?? "";
  const [tickers, setTickers] = useState<string[]>(() =>
    parseList(tickerKey || null, ["NVDA", "AMD"]).slice(0, 4),
  );
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
    setTickers(parseList(tickerKey || null, ["NVDA", "AMD"]).slice(0, 4));
  }, [tickerKey]);

  async function runCompare(list = tickers) {
    setLoading(true);
    try {
      const out: typeof rows = [];
      for (const t of list.slice(0, 4)) {
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
    void runCompare(parseList(tickerKey || null, ["NVDA", "AMD"]).slice(0, 4));
    // rerun when the route's ticker list changes; concept applies on Run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey]);

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
