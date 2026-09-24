import { APP_NAME } from "@repo/shared";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// The product name lives only in @repo/shared, so the page title is filled in at build time.
export function fillProductName(html: string): string {
  return html.replaceAll("%APP_NAME%", APP_NAME);
}

function productName(): Plugin {
  return { name: "product-name", transformIndexHtml: fillProductName };
}

export default defineConfig({
  // The router plugin must run before React: it generates src/routeTree.gen.ts from src/routes.
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    productName(),
  ],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});
