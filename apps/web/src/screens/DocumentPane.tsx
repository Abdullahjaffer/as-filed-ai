import { Button, Spin, Tree, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { readableText } from "../format.ts";
import { ancestorKeys, findOutline, outlineTree } from "../outline.ts";
import type { FilingDetail, OutlineSection } from "../types.ts";

export function DocumentPane({
  accession,
  focusSectionId,
  outlineWidth = 280,
  onActiveSection,
}: {
  accession: string;
  focusSectionId: string | null;
  outlineWidth?: number;
  onActiveSection?: (section: OutlineSection | null) => void;
}) {
  const [detail, setDetail] = useState<FilingDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [sectionBody, setSectionBody] = useState<string | null>(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [docBody, setDocBody] = useState<string | null>(null);
  const [bodyLoading, setBodyLoading] = useState(false);

  useEffect(() => {
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
        const focused =
          focusSectionId && findOutline(json.sections, focusSectionId)
            ? focusSectionId
            : (json.sections[0]?.id ?? null);
        setActiveSectionId(focused);
        onActiveSection?.(focused ? findOutline(json.sections, focused) : null);
        setExpandedKeys([
          ...json.sections.map((section) => section.id),
          ...(focused ? (ancestorKeys(json.sections, focused) ?? []) : []),
        ]);
        setActiveDocId(null);
        setDocBody(null);
      })
      .catch((cause: unknown) => {
        message.error(
          cause instanceof Error ? cause.message : "Filing load failed",
        );
      })
      .finally(() => setLoading(false));
  }, [accession, focusSectionId, onActiveSection]);

  useEffect(() => {
    if (!activeSectionId || activeDocId) {
      if (!activeSectionId) {
        setSectionBody(null);
      }
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
  }, [activeSectionId, activeDocId]);

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

  const exhibits = detail?.documents.filter((d) => d.kind === "exhibit") ?? [];

  if (loading || !detail) {
    return <Spin />;
  }

  return (
    <div style={{ display: "flex", gap: 16, minHeight: "70vh" }}>
      <div
        style={{
          width: outlineWidth,
          flex: `0 0 ${outlineWidth}px`,
          overflow: "auto",
          maxHeight: "75vh",
        }}
      >
        {detail.sections.length === 0 ? (
          <Typography.Text type="secondary">
            No parsed sections for this filing. Index-only rows and some forms
            have no stored narrative.
          </Typography.Text>
        ) : (
          <Tree
            blockNode
            selectedKeys={
              activeDocId || !activeSectionId ? [] : [activeSectionId]
            }
            expandedKeys={expandedKeys}
            onExpand={(keys) => setExpandedKeys(keys.map(String))}
            treeData={outlineTree(detail.sections)}
            onSelect={(keys) => {
              const id = String(keys[0] ?? "");
              if (!id) {
                return;
              }
              setActiveDocId(null);
              setDocBody(null);
              setActiveSectionId(id);
              onActiveSection?.(findOutline(detail.sections, id));
            }}
          />
        )}
        {exhibits.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            <Typography.Text type="secondary">Exhibits</Typography.Text>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginTop: 8,
              }}
            >
              {exhibits.map((doc) => (
                <Button
                  key={doc.id}
                  type={activeDocId === doc.id ? "primary" : "default"}
                  onClick={() => void loadDocument(doc.id)}
                >
                  {doc.documentType} · {doc.filename}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div style={{ flex: 1, overflow: "auto", maxHeight: "75vh" }}>
        {bodyLoading ? (
          <Spin />
        ) : (
          <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>
            {activeDocId
              ? readableText(docBody ?? "").slice(0, 200_000) || "No body"
              : (sectionBody ?? "No body")}
          </Typography.Paragraph>
        )}
      </div>
    </div>
  );
}
