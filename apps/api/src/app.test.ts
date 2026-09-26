import { describe, expect, test } from "bun:test";
import { REQUEST_ID_HEADER } from "@repo/server";
import { ERRORS } from "@repo/shared";
import { createApp, MAX_BODY_BYTES } from "./app";
import { testAppDeps } from "./testing";

const WEB_ORIGIN = "http://localhost:5173";
const OTHER_ORIGIN = "https://evil.example";

const app = createApp(testAppDeps({ corsOrigins: [WEB_ORIGIN] }));

describe("errors", () => {
  test("an unknown route answers 404 in the shared error shape", async () => {
    const response = await app.request("/v1/missing");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: ERRORS.NOT_FOUND.message,
        requestId: String(response.headers.get(REQUEST_ID_HEADER)),
      },
    });
  });
});

describe("security headers", () => {
  test("every response forbids sniffing, framing and loading anything", async () => {
    const { headers } = await app.request("/v1/missing");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("content-security-policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect(headers.get("strict-transport-security")).toStartWith("max-age=");
    expect(headers.get("x-powered-by")).toBeNull();
  });
});

describe("CORS", () => {
  test("lets an allowed origin read responses and the request id", async () => {
    const { headers } = await app.request("/v1/missing", { headers: { origin: WEB_ORIGIN } });
    expect(headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN);
    expect(headers.get("access-control-expose-headers")).toBe(REQUEST_ID_HEADER);
    expect(headers.get("access-control-allow-credentials")).toBeNull();
    expect(headers.get("vary")).toContain("Origin");
  });

  test("gives other origins no access", async () => {
    const { headers } = await app.request("/v1/missing", { headers: { origin: OTHER_ORIGIN } });
    expect(headers.get("access-control-allow-origin")).toBeNull();
  });

  const preflight = (origin: string) =>
    app.request("/v1/me", {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "authorization, content-type",
      },
    });

  test("answers a preflight from an allowed origin", async () => {
    const response = await preflight(WEB_ORIGIN);
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN);
    expect(response.headers.get("access-control-allow-methods")).toBe("GET,POST,PUT,PATCH,DELETE");
    expect(response.headers.get("access-control-allow-headers")).toBe("Authorization,Content-Type");
    expect(response.headers.get("access-control-max-age")).toBe("600");
    expect(response.headers.get(REQUEST_ID_HEADER)).not.toBeNull();
  });

  test("allows nothing in a preflight from another origin", async () => {
    const response = await preflight(OTHER_ORIGIN);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("body limit", () => {
  const post = (init: RequestInit) =>
    app.request("/v1/missing", {
      method: "POST",
      ...init,
      headers: { origin: WEB_ORIGIN, ...init.headers },
    });

  test("refuses a body whose declared size is over the limit", async () => {
    const response = await post({
      body: "x",
      headers: { "content-length": String(MAX_BODY_BYTES + 1) },
    });
    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PAYLOAD_TOO_LARGE");
    // The browser can read the error, so the web app can explain it.
    expect(response.headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN);
    expect(response.headers.get(REQUEST_ID_HEADER)).not.toBeNull();
  });

  test("refuses a streamed body once it passes the limit", async () => {
    const chunk = new Uint8Array(16 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > MAX_BODY_BYTES) {
          controller.close();
          return;
        }
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const response = await post({ body: stream });
    expect(response.status).toBe(413);
  });

  test("accepts a body at the limit", async () => {
    const response = await post({ body: "x".repeat(MAX_BODY_BYTES) });
    expect(response.status).toBe(404);
  });
});
