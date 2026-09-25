"use client";
import { RootProvider } from "fumadocs-ui/provider/next";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// The search engine and its index load only when someone opens search.
const StaticSearchDialog = dynamic(
  () => import("./search").then((module) => module.StaticSearchDialog),
  {
    ssr: false,
  },
);

export function Provider({ children }: { children: ReactNode }) {
  return <RootProvider search={{ SearchDialog: StaticSearchDialog }}>{children}</RootProvider>;
}
