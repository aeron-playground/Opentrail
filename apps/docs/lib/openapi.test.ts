import { describe, expect, test } from "bun:test";
import { basename } from "node:path";
import type { Document } from "fumadocs-openapi";
import {
  API_PAGES,
  LOCAL_SERVER,
  loadContract,
  openapi,
  routePageName,
  withLocalServer,
} from "./openapi";

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

describe("routePageName", () => {
  const cases = [
    { method: "get", path: "/v1/health", expected: "get-health" },
    { method: "GET", path: "/v1/tokens/{mint}", expected: "get-tokens-mint" },
    { method: "post", path: "/v1/swaps/{id}/submit", expected: "post-swaps-id-submit" },
    { method: "get", path: "/", expected: "get" },
  ];

  for (const { method, path, expected } of cases) {
    test(`${method.toUpperCase()} ${path} → ${expected}`, () => {
      expect(routePageName(method, path)).toBe(expected);
    });
  }
});

test("every route in the API contract gets its own reference page", async () => {
  const contract = await loadContract();
  const routes = Object.entries(contract.paths ?? {}).flatMap(([path, item]) =>
    METHODS.filter((method) => item !== undefined && method in item).map((method) =>
      routePageName(method, path),
    ),
  );
  expect(routes.length).toBeGreaterThan(0);

  const { files } = await openapi.staticSource(API_PAGES);
  const pages = files
    .filter((file) => file.type === "page")
    .map((file) => basename(file.path, ".mdx"));

  expect(pages.sort()).toEqual(routes.sort());
  for (const file of files) {
    expect(file.path.startsWith(`${API_PAGES.baseDir}/`)).toBe(true);
  }
});

describe("withLocalServer", () => {
  const base: Document = { openapi: "3.2.0", info: { title: "API", version: "1" } };

  test("gives the examples a local API while the contract names no server", () => {
    expect(withLocalServer(base).servers).toEqual([LOCAL_SERVER]);
  });

  test("keeps the contract's own servers once it lists them", () => {
    const servers = [{ url: "https://api.example.org" }];
    expect(withLocalServer({ ...base, servers }).servers).toEqual(servers);
  });
});
