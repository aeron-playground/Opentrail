import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { APIPage } from "../../../../../components/api-page";
import { API_PAGES } from "../../../../../lib/openapi";
import { source } from "../../../../../lib/source";

// Its own route, so only these pages load the API page's code and its code highlighter.
const PREFIX = API_PAGES.baseDir.split("/");

type Props = { params: Promise<{ slug: string[] }> };

async function findPage(params: Props["params"]) {
  const page = source.getPage([...PREFIX, ...(await params).slug]);
  if (page?.type !== "api") {
    notFound();
  }
  return page;
}

export default async function APIReferencePage({ params }: Props) {
  const page = await findPage(params);
  return (
    <DocsPage toc={page.data.toc} full>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <APIPage {...page.data.getOpenAPIPageProps()} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source
    .getPages()
    .filter((page) => page.type === "api")
    .map((page) => ({ slug: page.slugs.slice(PREFIX.length) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await findPage(params);
  return { title: page.data.title, description: page.data.description };
}
