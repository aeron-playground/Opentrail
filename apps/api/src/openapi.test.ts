import { expect, test } from "bun:test";
import { APP_NAME } from "@repo/shared";
import { createApp } from "./app";
import { OPENAPI_PATH, renderOpenApi, SNAPSHOT_PATH } from "./openapi";
import { testAppDeps } from "./testing";

const app = createApp(testAppDeps());

test("serves an OpenAPI 3.1 document with every route and the shared error shape", async () => {
  const response = await app.request(OPENAPI_PATH);
  expect(response.status).toBe(200);

  const document = (await response.json()) as {
    openapi: string;
    info: { title: string; version: string };
    paths: Record<string, unknown>;
    components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> };
  };
  expect(document.openapi).toBe("3.1.0");
  expect(document.info).toMatchObject({ title: `${APP_NAME} API`, version: "1" });
  expect(Object.keys(document.paths)).toEqual([
    "/v1/health",
    "/v1/me",
    "/v1/usernames/suggest",
    "/v1/usernames/{name}/available",
  ]);
  expect(Object.keys(document.components.schemas).sort()).toEqual([
    "Error",
    "Health",
    "Me",
    "MeUpdate",
    "UsernameAvailability",
    "UsernameSuggestion",
  ]);
  expect(document.components.securitySchemes).toMatchObject({
    bearerAuth: { type: "http", scheme: "bearer" },
  });
});

test("the committed snapshot is up to date (if not, run `bun run openapi`)", async () => {
  expect(await renderOpenApi(app)).toBe(await Bun.file(SNAPSHOT_PATH).text());
});
