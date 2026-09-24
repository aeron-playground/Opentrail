import { describe, expect, test } from "bun:test";
import { ERRORS } from "@repo/shared";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { AppError, errorHandler, notFound } from "./errors";
import { createLogger } from "./logger";
import { REQUEST_ID_HEADER, type RequestIdEnv, requestId } from "./request-id";

const HTTP_EXCEPTION_STATUSES = [400, 401, 404, 413, 415, 503] as const;

function testApp() {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger("info", {
    write: (line) => {
      lines.push(JSON.parse(line));
    },
  });
  const app = new Hono<RequestIdEnv>();
  app.use(requestId());
  app.get("/app-error", () => {
    throw new AppError("PAYLOAD_TOO_LARGE");
  });
  app.get("/crash", () => {
    throw new Error("password=hunter2 in the connection string");
  });
  for (const status of HTTP_EXCEPTION_STATUSES) {
    app.get(`/http/${status}`, () => {
      throw new HTTPException(status);
    });
  }
  app.notFound(notFound);
  app.onError(errorHandler(logger));
  return { app, lines };
}

async function errorOf(response: Response) {
  const body = (await response.json()) as { error: Record<string, unknown> };
  return body.error;
}

describe("errorHandler", () => {
  test("answers an AppError with its status, code and message", async () => {
    const response = await testApp().app.request("/app-error");
    expect(response.status).toBe(413);
    expect(await errorOf(response)).toEqual({
      code: "PAYLOAD_TOO_LARGE",
      message: ERRORS.PAYLOAD_TOO_LARGE.message,
      requestId: String(response.headers.get(REQUEST_ID_HEADER)),
    });
  });

  test("answers an unexpected error with INTERNAL and keeps the details in the log", async () => {
    const { app, lines } = testApp();
    const response = await app.request("/crash");
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text).error.code).toBe("INTERNAL");
    expect(text).not.toMatch(/hunter2|connection string|at \//);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: "error",
      requestId: response.headers.get(REQUEST_ID_HEADER),
      err: { message: "password=hunter2 in the connection string" },
    });
  });

  const mapped: { status: number; code: keyof typeof ERRORS; logged: boolean }[] = [
    { status: 400, code: "VALIDATION_FAILED", logged: false },
    { status: 404, code: "NOT_FOUND", logged: false },
    { status: 413, code: "PAYLOAD_TOO_LARGE", logged: false },
    { status: 415, code: "VALIDATION_FAILED", logged: false },
    { status: 401, code: "INTERNAL", logged: true },
    { status: 503, code: "INTERNAL", logged: true },
  ];

  for (const { status, code, logged } of mapped) {
    test(`maps a ${status} HTTPException to ${code}`, async () => {
      const { app, lines } = testApp();
      const response = await app.request(`/http/${status}`);
      expect(response.status).toBe(ERRORS[code].status);
      expect((await errorOf(response)).code).toBe(code);
      expect(lines).toHaveLength(logged ? 1 : 0);
    });
  }
});

describe("notFound", () => {
  test("answers an unknown route with NOT_FOUND", async () => {
    const response = await testApp().app.request("/missing");
    expect(response.status).toBe(404);
    expect((await errorOf(response)).code).toBe("NOT_FOUND");
  });
});
