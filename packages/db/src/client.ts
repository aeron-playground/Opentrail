import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DbHandle = ReturnType<typeof createDb>;
export type Database = DbHandle["db"];

export function createDb(url: string, options: { maxConnections?: number } = {}) {
  const client = postgres(url, {
    max: options.maxConnections ?? 10,
    // Notices such as "extension already exists" are expected during migrations.
    onnotice: () => {},
  });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}
