import { Button, Card, Col, Row, Select, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import type { Company, FilingDetail, SectionFilingRow } from "../types.ts";
import { useGoBack } from "../useGoBack.ts";
import { DocumentPane } from "./DocumentPane.tsx";

function CompareColumn({
  label,
  initialAccession,
  focusSectionId,
}: {
  label: string;
  initialAccession: string | null;
  focusSectionId: string | null;
}) {
  const [companiesList, setCompaniesList] = useState<Company[]>([]);
  const [ticker, setTicker] = useState<string | undefined>(undefined);
  const [filings, setFilings] = useState<SectionFilingRow[]>([]);
  const [accession, setAccession] = useState<string | null>(initialAccession);

  useEffect(() => {
    void fetch("/api/companies")
      .then((r) => r.json())
      .then((json: { companies: Company[] }) => setCompaniesList(json.companies));
  }, []);

  useEffect(() => {
    setAccession(initialAccession);
    if (!initialAccession) {
      return;
    }
    void fetch(`/api/filings/${encodeURIComponent(initialAccession)}`)
      .then(async (res) => {
        if (!res.ok) {
          return null;
        }
        return (await res.json()) as FilingDetail;
      })
      .then((json) => {
        if (json) {
          setTicker(json.filing.ticker);
        }
      });
  }, [initialAccession]);

  useEffect(() => {
    if (!ticker) {
      setFilings([]);
      return;
    }
    void fetch(`/api/companies/${ticker}/section-filings`)
      .then(async (res) => {
        if (!res.ok) {
          return { filings: [] as SectionFilingRow[] };
        }
        return (await res.json()) as { filings: SectionFilingRow[] };
      })
      .then((json) => setFilings(json.filings));
  }, [ticker]);

  return (
    <Card
      title={label}
      extra={accession ? <Tag>{accession}</Tag> : <Tag>Pick a filing</Tag>}
    >
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Select
          showSearch
          optionFilterProp="label"
          style={{ width: "100%" }}
          placeholder="Company"
          value={ticker}
          onChange={(next) => {
            setTicker(next);
            setAccession(null);
          }}
          options={companiesList.map((c) => ({
            value: c.ticker,
            label: `${c.ticker} · ${c.name}`,
          }))}
        />
        <Select
          showSearch
          optionFilterProp="label"
          style={{ width: "100%" }}
          placeholder="Filing with stored text"
          value={accession ?? undefined}
          onChange={setAccession}
          options={filings.map((f) => ({
            value: f.accessionNumber,
            label: `${f.filingDate} · ${f.form}`,
          }))}
        />
        {accession ? (
          <DocumentPane
            accession={accession}
            focusSectionId={
              accession === initialAccession ? focusSectionId : null
            }
            outlineWidth={200}
          />
        ) : (
          <Typography.Text type="secondary">
            Choose a company and a filing to show its sections here.
          </Typography.Text>
        )}
      </Space>
    </Card>
  );
}

export function Component() {
  const [params] = useSearchParams();
  const goBack = useGoBack("/filings");
  const initialLeft = params.get("left");
  const initialRight = params.get("right");
  const initialLeftSectionId = params.get("section");

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <div>
        <Button type="link" style={{ paddingLeft: 0 }} onClick={goBack}>
          Back
        </Button>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Compare filings
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Read two stored filings next to each other. Each column keeps its own
          outline and section text.
        </Typography.Paragraph>
      </div>
      <Row gutter={16}>
        <Col xs={24} xl={12}>
          <CompareColumn
            label="Left filing"
            initialAccession={initialLeft}
            focusSectionId={initialLeftSectionId}
          />
        </Col>
        <Col xs={24} xl={12}>
          <CompareColumn
            label="Right filing"
            initialAccession={initialRight}
            focusSectionId={null}
          />
        </Col>
      </Row>
    </Space>
  );
}
