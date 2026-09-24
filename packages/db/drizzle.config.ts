import { defineConfig } from "drizzle-kit";

// Only `drizzle-kit generate` uses this file, and it doesn't connect to a database.
// Migrations are applied by src/migrate.ts.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  strict: true,
});
