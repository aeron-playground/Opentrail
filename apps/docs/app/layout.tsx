import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Provider } from "../components/provider";
import { SITE_NAME } from "../lib/site";
import "./global.css";

export const metadata: Metadata = {
  title: { template: `%s | ${SITE_NAME}`, default: SITE_NAME },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme script changes the class on <html> before React loads.
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col font-sans">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
