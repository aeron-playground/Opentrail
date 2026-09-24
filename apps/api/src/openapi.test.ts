import { expect, test } from "bun:test";
import { APP_NAME } from "@repo/shared";
import { createApp } from "./app";
import { createLogger } from "./lib/logger";
import { OPENAPI_PATH, renderOpenApi, SNAPSHOT_PATH } from "./openapi";

const app = createApp({
  logger: createLogger("silent"),
  corsOrigins: [],
  checkDatabase: async () => {},
});

test("serves an OpenAPI 3.1 document with every route and the shared error shape", async () => {
  const response = await app.request(OPENAPI_PATH);
  expect(response.status).toBe(200);

  const document = (await response.json()) as {
    openapi: string;
    info: { title: string; version: string };
    paths: Record<string, unknown>;
    components: { schemas: Record<string, unknown> };
  };
  expect(document.openapi).toBe("3.1.0");
  expect(document.info).toMatchObject({ title: `${APP_NAME} API`, version: "1" });
  expect(Object.keys(document.paths)).toEqual(["/v1/health"]);
  expect(Object.keys(document.components.schemas).sort()).toEqual(["Error", "Health"]);
});

test("the committed snapshot is up to date (if not, run `bun run openapi`)", async () => {
  expect(await renderOpenApi(app)).toBe(await Bun.file(SNAPSHOT_PATH).text());
});
