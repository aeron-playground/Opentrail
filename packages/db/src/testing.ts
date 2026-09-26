// Helpers for tests that need a real database. Never import this from app code.
import { sql } from "drizzle-orm";
import { createDb, type DbHandle } from "./client";
import { readTestDbEnv } from "./env";
import { postgresErrorCode } from "./errors";
import { applyMigrations } from "./migrations";

const DUPLICATE_DATABASE = "42P04";
// The name goes into a CREATE DATABASE statement, so only plain lowercase names are allowed.
const DATABASE_NAME = /^[a-z][a-z0-9_]*$/;

type EnvSource = Record<string, string | undefined>;

// Tests drop every table, so refuse any database that isn't clearly meant for tests.
export function assertTestDatabaseUrl(url: string): void {
  const name = databaseName(url);
  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to reset database "${name}": test database names must end in "_test".`,
    );
  }
}

// Each package that resets a database gets its own, so `turbo run test` can run packages side by
// side. With TEST_DATABASE_URL ending in /app_test, "indexer" gives /app_indexer_test.
export function testDatabaseUrl(name?: string, source: EnvSource = process.env): string {
  const { TEST_DATABASE_URL } = readTestDbEnv(source);
  if (name === undefined) {
    return TEST_DATABASE_URL;
  }
  if (!DATABASE_NAME.test(name)) {
    throw new Error(
      `Invalid test database name "${name}": use lowercase letters, digits and underscores.`,
    );
  }
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${databaseName(TEST_DATABASE_URL).replace(/_test$/, "")}_${name}_test`;
  return url.toString();
}

// Connects to a test database without resetting it, for tests that only need a live connection.
export function connectTestDb(name?: string): DbHandle {
  const url = testDatabaseUrl(name);
  assertTestDatabaseUrl(url);
  return createDb(url, { maxConnections: 1 });
}

// Returns a fresh database: every table dropped, then all migrations applied. Pass the package
// name ("indexer") to get that package's own database, created on first use.
export async function createTestDb(name?: string): Promise<DbHandle> {
  if (name !== undefined) {
    await ensureDatabase(testDatabaseUrl(name));
  }
  const handle = connectTestDb(name);
  await handle.db.execute(sql`drop schema if exists drizzle cascade`);
  await handle.db.execute(sql`drop schema if exists public cascade`);
  await handle.db.execute(sql`create schema public`);
  await applyMigrations(handle.db);
  return handle;
}

function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

async function ensureDatabase(url: string): Promise<void> {
  assertTestDatabaseUrl(url);
  const name = databaseName(url);
  if (!DATABASE_NAME.test(name)) {
    throw new Error(`Invalid test database name "${name}".`);
  }
  // Any database on the server can create another one; the shared test database is at hand.
  const admin = connectTestDb();
  try {
    await admin.db.execute(sql.raw(`create database "${name}"`));
  } catch (error) {
    if (postgresErrorCode(error) !== DUPLICATE_DATABASE) {
      throw error;
    }
  } finally {
    await admin.close();
  }
}
