// Loads the curated token list: `bun run db:seed` locally, and after migrations on each deploy.
import { createDb } from "./client";
import { readDbEnv } from "./env";
import { seedTokens } from "./seed/seed-tokens";

async function main(): Promise<void> {
  const { DATABASE_URL } = readDbEnv();
  const { db, close } = createDb(DATABASE_URL, { maxConnections: 1 });
  try {
    console.log(`${await seedTokens(db)} tokens saved.`);
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
