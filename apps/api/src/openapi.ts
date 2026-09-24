import { join } from "node:path";
import { APP_NAME } from "@repo/shared";
import type { App } from "./app";

export const OPENAPI_PATH = "/v1/openapi.json";

export const OPENAPI_CONFIG = {
  openapi: "3.1.0",
  info: {
    title: `${APP_NAME} API`,
    // The contract version, not the app version. Release pull requests bump the app version,
    // and the committed snapshot must not change with them.
    version: "1",
    description:
      "Every response has an x-request-id header, and every error uses the Error shape. " +
      "Amounts are strings, and times are ISO 8601 in UTC.",
  },
};

// The committed copy of the contract. `bun run openapi` writes it; clients are generated from it.
export const SNAPSHOT_PATH = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "packages",
  "api-client",
  "openapi.json",
);

// Renders the document exactly as the running API serves it.
export async function renderOpenApi(app: App): Promise<string> {
  const response = await app.request(OPENAPI_PATH);
  if (!response.ok) {
    throw new Error(`${OPENAPI_PATH} answered ${response.status}`);
  }
  return `${JSON.stringify(await response.json(), null, 2)}\n`;
}
