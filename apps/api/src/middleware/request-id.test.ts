import { expect, test } from "bun:test";
import { createRouter } from "../lib/router";
import { REQUEST_ID_HEADER, requestId } from "./request-id";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function testApp() {
  const app = createRouter();
  app.use(requestId());
  app.get("/ok", (c) => c.json({ requestId: c.var.requestId }));
  app.get("/raw", () => new Response("raw"));
  app.get("/fails", () => {
    throw new Error("boom");
  });
  app.onError((_error, c) => c.text("failed", 500));
  return app;
}

test("gives every response a new UUIDv7 id", async () => {
  const app = testApp();
  const first = (await app.request("/ok")).headers.get(REQUEST_ID_HEADER);
  const second = (await app.request("/ok")).headers.get(REQUEST_ID_HEADER);
  expect(first).toMatch(UUID_V7);
  expect(second).toMatch(UUID_V7);
  expect(first).not.toBe(second);
});

test("puts the same id on the context and the response", async () => {
  const response = await testApp().request("/ok");
  const body = (await response.json()) as { requestId: string };
  expect(body.requestId).toBe(String(response.headers.get(REQUEST_ID_HEADER)));
});

const paths: { name: string; path: string; status: number }[] = [
  { name: "a raw response", path: "/raw", status: 200 },
  { name: "an error", path: "/fails", status: 500 },
  { name: "an unknown route", path: "/missing", status: 404 },
];

for (const { name, path, status } of paths) {
  test(`adds the id to ${name}`, async () => {
    const response = await testApp().request(path);
    expect(response.status).toBe(status);
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(UUID_V7);
  });
}

test("ignores an id sent by the client", async () => {
  const response = await testApp().request("/ok", {
    headers: { [REQUEST_ID_HEADER]: "client-chosen-id" },
  });
  expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(UUID_V7);
});
