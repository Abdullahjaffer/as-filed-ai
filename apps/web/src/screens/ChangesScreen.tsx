import {
  Button,
  Card,
  Collapse,
  Form,
  Input,
  Select,
  Space,
  Typography,
  message,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { SECTION_ITEM_OPTIONS } from "../constants.ts";
import type { FilingRow } from "../types.ts";

export function Component() {
  const [params] = useSearchParams();
  const seedKey = params.toString();
  const [ticker, setTicker] = useState(params.get("ticker") ?? "NVDA");
  const [item, setItem] = useState(params.get("item") ?? "1A");
  const [filings, setFilings] = useState<FilingRow[]>([]);
  const [older, setOlder] = useState<string | undefined>(
    params.get("older") ?? undefined,
  );
  const [newer, setNewer] = useState<string | undefined>(
    params.get("newer") ?? undefined,
  );
  const [result, setResult] = useState<{
    added: string[];
    removed: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadFilings(
    t: string,
    preferOlder?: string,
    preferNewer?: string,
  ) {
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

  async function runDirectDiff(overrides?: {
    older?: string;
    newer?: string;
    item?: string;
    ticker?: string;
  }) {
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
    const tickerSeed = params.get("ticker") ?? "NVDA";
    const itemSeed = params.get("item") ?? "1A";
    const olderSeed = params.get("older") ?? undefined;
    const newerSeed = params.get("newer") ?? undefined;
    setTicker(tickerSeed);
    setItem(itemSeed);
    setOlder(olderSeed);
    setNewer(newerSeed);
    setResult(null);
    void loadFilings(tickerSeed, olderSeed, newerSeed).then((picked) => {
      if (olderSeed && newerSeed && picked?.older && picked?.newer) {
        void runDirectDiff({
          older: picked.older,
          newer: picked.newer,
          item: itemSeed,
          ticker: tickerSeed,
        });
      }
    });
    // seed comes from the URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

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
