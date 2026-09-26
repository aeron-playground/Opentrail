// Postgres error codes the apps react to:
// https://www.postgresql.org/docs/current/errcodes-appendix.html
export const UNIQUE_VIOLATION = "23505";

// Drizzle wraps driver errors, so the Postgres error code can sit on `cause`.
export function postgresErrorCode(error: unknown): string | undefined {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ("code" in current && typeof current.code === "string") {
      return current.code;
    }
  }
  return undefined;
}
