import Link from "next/link";
import { SiteLayout } from "../components/site-layout";

export default function NotFound() {
  return (
    <SiteLayout>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 px-4 py-16">
        <h1 className="font-semibold text-3xl">Page not found</h1>
        <p className="text-fd-muted-foreground">
          We couldn't find that page. Search the docs, or start again from the{" "}
          <Link href="/" className="font-medium text-fd-foreground underline">
            first page
          </Link>
          .
        </p>
      </main>
    </SiteLayout>
  );
}
