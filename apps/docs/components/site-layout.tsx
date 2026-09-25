import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { REPOSITORY_URL, SITE_NAME } from "../lib/site";
import { source } from "../lib/source";

// The sidebar, header and search around every page, the not-found page included.
export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout tree={source.getPageTree()} nav={{ title: SITE_NAME }} githubUrl={REPOSITORY_URL}>
      {children}
    </DocsLayout>
  );
}
