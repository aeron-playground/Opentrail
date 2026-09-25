import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Document, SchemaToPagesOptions } from "fumadocs-openapi";
import { createOpenAPI } from "fumadocs-openapi/server";

// The API contract that `bun run openapi` writes. Next.js runs from apps/docs, and so do the tests.
export const OPENAPI_FILE = join(process.cwd(), "../../packages/api-client/openapi.json");

// "GET /v1/tokens/{mint}" → "get-tokens-mint". Every route shares the version, so it's left out.
export function routePageName(method: string, path: string): string {
  const segments = path
    .split("/")
    .filter((segment) => segment !== "" && segment !== "v1")
    .map((segment) => segment.replace(/[{}]/g, ""));
  return [method.toLowerCase(), ...segments].join("-");
}

// One page per route, in a folder per tag: "API reference > System > page".
export const API_PAGES = {
  baseDir: "developers/api",
  groupBy: "tag",
  name: (output) =>
    output.type === "operation"
      ? routePageName(output.item.method, output.item.path)
      : `webhook-${output.item.name}`,
} satisfies SchemaToPagesOptions & { baseDir: string };

// The contract names no public server yet, so the examples on each page use a local API
// (`bun run dev`). Once the contract lists servers, they take its place.
export const LOCAL_SERVER = { url: "http://localhost:3001", description: "Your local API" };

export function withLocalServer(contract: Document): Document {
  return { servers: [LOCAL_SERVER], ...contract };
}

export async function loadContract(): Promise<Document> {
  // Our own generated file; the API's build checks its shape.
  const contract = JSON.parse(await readFile(OPENAPI_FILE, "utf8")) as Document;
  return withLocalServer(contract);
}

export const openapi = createOpenAPI({
  input: { api: loadContract },
});
