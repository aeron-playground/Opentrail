import { LOG_LEVELS } from "@repo/server";
import { z } from "zod";

const indexerEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // Helius sends this value, unchanged, in the Authorization header of every delivery.
  HELIUS_WEBHOOK_SECRET: z.string().min(32, { error: "must be at least 32 characters" }),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3002),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
});

export type IndexerEnv = z.infer<typeof indexerEnvSchema>;

type EnvSource = Record<string, string | undefined>;

export function readIndexerEnv(source: EnvSource = process.env): IndexerEnv {
  const result = indexerEnvSchema.safeParse(source);
  if (!result.success) {
    // prettifyError names the variable and the problem, never the value, so secrets stay out.
    throw new Error(
      `Invalid indexer settings:\n${z.prettifyError(result.error)}\n` +
        "Copy apps/indexer/.env.example to apps/indexer/.env and check the values.",
    );
  }
  return result.data;
}
