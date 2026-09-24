// Helpers for tests that need a real database. Never import this from app code.
import { sql } from "drizzle-orm";
import { createDb, type DbHandle } from "./client";
import { readTestDbEnv } from "./env";
import { applyMigrations } from "./migrations";

// Tests drop every table, so refuse any database that isn't clearly meant for tests.
export function assertTestDatabaseUrl(url: string): void {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to reset database "${name}": test database names must end in "_test".`,
    );
  }
}

// Returns a fresh database: every table dropped, then all migrations applied.
export async function createTestDb(): Promise<DbHandle> {
  const { TEST_DATABASE_URL } = readTestDbEnv();
  assertTestDatabaseUrl(TEST_DATABASE_URL);
  const handle = createDb(TEST_DATABASE_URL, { maxConnections: 1 });
  await handle.db.execute(sql`drop schema if exists drizzle cascade`);
  await handle.db.execute(sql`drop schema if exists public cascade`);
  await handle.db.execute(sql`create schema public`);
  await applyMigrations(handle.db);
  return handle;
}

// Drizzle wraps driver errors, so the Postgres error code can sit on `cause`.
export function postgresErrorCode(error: unknown): string | undefined {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ("code" in current && typeof current.code === "string") {
      return current.code;
    }
  }
  return undefined;
}
