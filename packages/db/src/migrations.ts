import { join } from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Database } from "./client";

const MIGRATIONS_FOLDER = join(import.meta.dir, "..", "migrations");

export async function applyMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
