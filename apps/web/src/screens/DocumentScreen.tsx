import { Button, Card, Flex, Space, Typography, message } from "antd";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { changesPath, peersPath } from "../paths.ts";
import type { FilingDetail, FilingRow, OutlineSection } from "../types.ts";
import { useGoBack } from "../useGoBack.ts";
import { DocumentPane } from "./DocumentPane.tsx";

async function priorFilingAccession(
  ticker: string,
  accession: string,
  filingDate: string,
): Promise<string | undefined> {
  const res = await fetch(`/api/companies/${ticker}/filings`);
  if (!res.ok) {
    return undefined;
  }
  const json = (await res.json()) as { filings: FilingRow[] };
  const prior = json.filings.filter(
    (f) => f.accessionNumber !== accession && f.filingDate <= filingDate,
  );
  return (
    prior.find((f) => f.form.startsWith("10-K")) ??
    prior.find((f) => f.form.startsWith("10-Q")) ??
    prior[0]
  )?.accessionNumber;
}

export function Component() {
  const { accession = "" } = useParams();
  const [params] = useSearchParams();
  const focusSectionId = params.get("section");
  const navigate = useNavigate();
  const goBack = useGoBack("/filings");
  const [detail, setDetail] = useState<FilingDetail | null>(null);
  const [activeSection, setActiveSection] = useState<OutlineSection | null>(
    null,
  );
  const rememberSection = useCallback((section: OutlineSection | null) => {
    setActiveSection(section);
  }, []);

  useEffect(() => {
    setDetail(null);
    setActiveSection(null);
    void fetch(`/api/filings/${encodeURIComponent(accession)}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Filing load failed (${res.status})`);
        }
        return (await res.json()) as FilingDetail;
      })
      .then(setDetail)
      .catch((cause: unknown) => {
        message.error(
          cause instanceof Error ? cause.message : "Filing load failed",
        );
      });
  }, [accession]);

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Flex justify="space-between" align="flex-start" wrap gap={12}>
        <div>
          <Button type="link" style={{ paddingLeft: 0 }} onClick={goBack}>
            Back
          </Button>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {detail
              ? `${detail.filing.ticker} · ${detail.filing.form} · ${detail.filing.filingDate}`
              : "Filing"}
          </Typography.Title>
          {detail ? (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {detail.filing.name} · CIK {detail.filing.cik}
              {detail.filing.sicDescription
                ? ` · ${detail.filing.sicDescription}`
                : ""}
              {" · "}
              <a href={detail.filing.filingUrl} target="_blank" rel="noreferrer">
                Open on EDGAR
              </a>
            </Typography.Paragraph>
          ) : null}
        </div>
        {detail ? (
          <Space wrap>
            <Button
              onClick={() =>
                navigate(
                  peersPath(
                    [detail.filing.ticker, "AAPL", "AMD", "MSFT", "NVDA"]
                      .filter((t, i, arr) => arr.indexOf(t) === i)
                      .slice(0, 4),
                  ),
                )
              }
            >
              Peer metrics
            </Button>
            <Button
              type="primary"
              disabled={!activeSection}
              onClick={() => {
                if (!activeSection) {
                  return;
                }
                void priorFilingAccession(
                  detail.filing.ticker,
                  detail.filing.accessionNumber,
                  detail.filing.filingDate,
                ).then((older) =>
                  navigate(
                    changesPath({
                      ticker: detail.filing.ticker,
                      item: activeSection.item,
                      newer: detail.filing.accessionNumber,
                      older,
                    }),
                  ),
                );
              }}
            >
              Diff this section
            </Button>
          </Space>
        ) : null}
      </Flex>
      <Card>
        <DocumentPane
          accession={accession}
          focusSectionId={focusSectionId}
          onActiveSection={rememberSection}
        />
      </Card>
    </Space>
  );
}
