import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { createRelativeLink } from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMDXComponents } from "../../../components/mdx";
import { REPOSITORY, REPOSITORY_URL } from "../../../lib/site";
import { source } from "../../../lib/source";

type Props = { params: Promise<{ slug?: string[] }> };

export default async function Page({ params }: Props) {
  const page = source.getPage((await params).slug);
  // The API reference has its own route, so this one never loads the API page's code.
  if (page?.type !== "docs") {
    notFound();
  }

  const Content = page.data.body;
  const editUrl = `${REPOSITORY_URL}/blob/${REPOSITORY.branch}/apps/docs/content/docs/${page.path}`;

  return (
    <DocsPage toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        {/* Links to other pages can use file paths, like [Fees](../how-it-works/fees.mdx). */}
        <Content components={getMDXComponents({ a: createRelativeLink(source, page) })} />
      </DocsBody>
      <a href={editUrl} className="text-fd-muted-foreground text-sm hover:text-fd-foreground">
        Edit this page on GitHub
      </a>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source
    .getPages()
    .filter((page) => page.type === "docs")
    .map((page) => ({ slug: page.slugs }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = source.getPage((await params).slug);
  if (!page) {
    notFound();
  }
  return { title: page.data.title, description: page.data.description };
}
