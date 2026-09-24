import { z } from "zod";

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });

const LOCAL_TEST_DATABASE_URL = "postgres://app:app@localhost:5432/app_test";

const dbEnvSchema = z.object({ DATABASE_URL: postgresUrl });
const testDbEnvSchema = z.object({
  TEST_DATABASE_URL: postgresUrl.default(LOCAL_TEST_DATABASE_URL),
});

type EnvSource = Record<string, string | undefined>;

export function readDbEnv(source: EnvSource = process.env): z.infer<typeof dbEnvSchema> {
  return parse(dbEnvSchema, source);
}

export function readTestDbEnv(source: EnvSource = process.env): z.infer<typeof testDbEnvSchema> {
  return parse(testDbEnvSchema, source);
}

function parse<T extends z.ZodType>(schema: T, source: EnvSource): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    // prettifyError names the variable and the problem, never the value, so passwords stay out.
    throw new Error(
      `Invalid database settings:\n${z.prettifyError(result.error)}\n` +
        "Copy packages/db/.env.example to packages/db/.env and check the values.",
    );
  }
  return result.data;
}
