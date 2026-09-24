import { APP_NAME } from "@repo/shared";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// The product name lives only in @repo/shared, so the page title is filled in at build time.
export function productName(): Plugin {
  return {
    name: "product-name",
    transformIndexHtml: (html) => html.replaceAll("%APP_NAME%", APP_NAME),
  };
}

export default defineConfig({
  plugins: [react(), productName()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});
