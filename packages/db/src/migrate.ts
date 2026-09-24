// Applies pending migrations: `bun run db:migrate` locally, and before each deploy.
import { createDb } from "./client";
import { readDbEnv } from "./env";
import { applyMigrations } from "./migrations";

async function main(): Promise<void> {
  const { DATABASE_URL } = readDbEnv();
  const { db, close } = createDb(DATABASE_URL, { maxConnections: 1 });
  try {
    await applyMigrations(db);
    console.log("Migrations applied.");
  } finally {
    await close();
  }
}

try {
  await main();
} catch (error) {
  // The message says what to fix; a stack trace would only bury it.
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
