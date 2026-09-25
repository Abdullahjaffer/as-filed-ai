import { Alert, Layout, Spin, Tag, Typography } from "antd";
import { XProvider } from "@ant-design/x";
import { useEffect, useState } from "react";
import {
  NavLink,
  Outlet,
  useNavigation,
  useRouteError,
  isRouteErrorResponse,
} from "react-router";
import type { Health } from "./types.ts";

const { Header, Content } = Layout;

const NAV_ITEMS = [
  { to: "/", label: "Research brief", end: true },
  { to: "/filings", label: "View filings", end: true },
  { to: "/matrix", label: "Matrix", end: true },
];

function Shell({ loading }: { loading?: boolean }) {
  const navigation = useNavigation();
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const routePending = navigation.state === "loading";

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
        <Header
          style={{
            background: "#fff",
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            paddingInline: 24,
            height: "auto",
            lineHeight: "normal",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <Typography.Text strong style={{ marginRight: 16 }}>
            Filing Desk
          </Typography.Text>
          <nav style={{ display: "flex", flexWrap: "nowrap", gap: 4 }}>
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                style={({ isActive }) => ({
                  display: "inline-flex",
                  alignItems: "center",
                  height: 32,
                  padding: "0 15px",
                  borderRadius: 6,
                  textDecoration: "none",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "#1677ff" : "rgba(0,0,0,0.88)",
                })}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          {health ? (
            <Tag color="success" style={{ marginLeft: "auto" }}>
              {health.service}
            </Tag>
          ) : (
            <Tag
              color={error ? "error" : "processing"}
              style={{ marginLeft: "auto" }}
            >
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
          {loading || routePending ? (
            <div style={{ marginBottom: 16 }}>
              <Spin />
            </div>
          ) : null}
          {loading ? null : <Outlet />}
        </Content>
      </Layout>
    </XProvider>
  );
}

export function Component() {
  return <Shell />;
}

export function HydrateFallback() {
  return <Shell loading />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const description = isRouteErrorResponse(error)
    ? error.statusText
    : error instanceof Error
      ? error.message
      : "This screen failed to load.";
  return (
    <Alert
      type="error"
      showIcon
      message="Screen failed to load"
      description={description}
    />
  );
}
