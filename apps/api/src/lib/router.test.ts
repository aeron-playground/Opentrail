import { describe, expect, test } from "bun:test";
import { createRoute, z } from "@hono/zod-openapi";
import { createLogger, errorHandler, notFound, requestId } from "@repo/server";
import { createRouter } from "./router";

const createThing = createRoute({
  method: "post",
  path: "/things",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: z.object({ name: z.string().min(1) }) } },
    },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: z.object({ name: z.string() }) } },
    },
  },
});

function testApp() {
  const app = createRouter();
  app.use(requestId());
  app.openapi(createThing, (c) => c.json({ name: c.req.valid("json").name }, 201));
  app.notFound(notFound);
  app.onError(errorHandler(createLogger("silent")));
  return app;
}

async function errorCodeOf(response: Response) {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

describe("input validation", () => {
  const post = (body: string, contentType = "application/json") =>
    testApp().request("/things", {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    });

  test("passes valid input to the route", async () => {
    const response = await post(JSON.stringify({ name: "maya" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ name: "maya" });
  });

  const invalid: { name: string; body: string; contentType?: string }[] = [
    { name: "a missing field", body: JSON.stringify({}) },
    { name: "a field that breaks a rule", body: JSON.stringify({ name: "" }) },
    { name: "malformed JSON", body: "{not json" },
    { name: "the wrong content type", body: "name=maya", contentType: "text/plain" },
  ];

  for (const { name, body, contentType } of invalid) {
    test(`answers ${name} with VALIDATION_FAILED`, async () => {
      const response = await post(body, contentType);
      expect(response.status).toBe(400);
      expect(await errorCodeOf(response)).toBe("VALIDATION_FAILED");
    });
  }
});
