import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { assertTestDatabaseUrl, createTestDb, testDatabaseUrl } from "./testing";

describe("assertTestDatabaseUrl", () => {
  const cases: { name: string; url: string; allowed: boolean }[] = [
    { name: "a _test database", url: "postgres://app:app@localhost:5432/app_test", allowed: true },
    { name: "the dev database", url: "postgres://app:app@localhost:5432/app", allowed: false },
    { name: "no database name", url: "postgres://app:app@localhost:5432", allowed: false },
    { name: "_test in the middle", url: "postgres://app:app@localhost/app_test_x", allowed: false },
    { name: "_test in the host only", url: "postgres://app:app@db_test:5432/app", allowed: false },
  ];

  for (const { name, url, allowed } of cases) {
    test(`${allowed ? "allows" : "refuses"} ${name}`, () => {
      const check = () => assertTestDatabaseUrl(url);
      if (allowed) {
        expect(check).not.toThrow();
      } else {
        expect(check).toThrow("Refusing to reset database");
      }
    });
  }
});

describe("testDatabaseUrl", () => {
  const env = { TEST_DATABASE_URL: "postgres://app:app@localhost:5432/app_test" };

  const cases: { name: string | undefined; expected: string }[] = [
    { name: undefined, expected: "postgres://app:app@localhost:5432/app_test" },
    { name: "indexer", expected: "postgres://app:app@localhost:5432/app_indexer_test" },
    { name: "api_v2", expected: "postgres://app:app@localhost:5432/app_api_v2_test" },
  ];

  for (const { name, expected } of cases) {
    test(`gives ${name ?? "no name"} ${new URL(expected).pathname.slice(1)}`, () => {
      expect(testDatabaseUrl(name, env)).toBe(expected);
    });
  }

  test("keeps the base name when it has no _test suffix", () => {
    const url = testDatabaseUrl("indexer", { TEST_DATABASE_URL: "postgres://ci@db/ci" });
    expect(url).toBe("postgres://ci@db/ci_indexer_test");
  });

  for (const name of ["", "Indexer", "1indexer", "index-er", 'x"; drop database app; --']) {
    test(`refuses the name ${JSON.stringify(name)}`, () => {
      expect(() => testDatabaseUrl(name, env)).toThrow("Invalid test database name");
    });
  }
});

describe("createTestDb with a package name", () => {
  test("creates that package's own database, migrated and apart from app_test", async () => {
    const first = await createTestDb("testing");
    try {
      const [row] = await first.db.execute<{ name: string; users: string | null }>(
        sql`select current_database() as name, to_regclass('public.users')::text as users`,
      );
      expect(row).toEqual({
        name: new URL(testDatabaseUrl("testing")).pathname.slice(1),
        users: "users",
      });
    } finally {
      await first.close();
    }

    // A second run finds the database already there and just resets it.
    const second = await createTestDb("testing");
    await second.close();
  });
});
