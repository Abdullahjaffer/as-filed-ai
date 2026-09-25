import { createBrowserRouter } from "react-router";
import { Component, ErrorBoundary, HydrateFallback } from "./App.tsx";

export const router = createBrowserRouter([
  {
    path: "/",
    Component,
    HydrateFallback,
    ErrorBoundary,
    children: [
      { index: true, lazy: () => import("./screens/ResearchScreen.tsx") },
      { path: "filings", lazy: () => import("./screens/FilingsScreen.tsx") },
      {
        path: "filings/:accession",
        lazy: () => import("./screens/DocumentScreen.tsx"),
      },
      { path: "matrix", lazy: () => import("./screens/MatrixScreen.tsx") },
      { path: "peers", lazy: () => import("./screens/PeersScreen.tsx") },
      { path: "changes", lazy: () => import("./screens/ChangesScreen.tsx") },
      { path: "compare", lazy: () => import("./screens/CompareDocsScreen.tsx") },
      { path: "evals", lazy: () => import("./screens/EvalsScreen.tsx") },
    ],
  },
]);
