import { LOG_LEVELS } from "@repo/server";
import { z } from "zod";

// Browsers send the Origin header in exactly this form, so any other spelling would never match.
function isOrigin(value: string): boolean {
  if (!URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value;
}

const apiEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin !== ""),
    )
    .pipe(
      z
        .array(
          z.string().refine(isOrigin, {
            error: "must be an origin such as https://example.com, with no path or trailing slash",
          }),
        )
        .min(1, { error: "needs at least one origin" }),
    ),
  // From the Privy dashboard. The app id is public; the secret must stay on the server.
  PRIVY_APP_ID: z.string().min(1),
  PRIVY_APP_SECRET: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

type EnvSource = Record<string, string | undefined>;

export function readApiEnv(source: EnvSource = process.env): ApiEnv {
  const result = apiEnvSchema.safeParse(source);
  if (!result.success) {
    // prettifyError names the variable and the problem, never the value, so secrets stay out.
    throw new Error(
      `Invalid API settings:\n${z.prettifyError(result.error)}\n` +
        "Copy apps/api/.env.example to apps/api/.env and check the values.",
    );
  }
  return result.data;
}
