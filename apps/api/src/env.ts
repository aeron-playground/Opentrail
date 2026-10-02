import { LOG_LEVELS } from "@repo/server";
import { isSolanaAddress } from "@repo/solana";
import { z } from "zod";

// Empty counts as unset, so a blank line in .env falls back to the default.
const unsetIfEmpty = z
  .string()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

// A whole number setting. Blank is an error, not 0, so nobody switches a limit off by accident.
const wholeNumber = (fallback: string) =>
  z.string().regex(/^\d+$/, { error: "must be a whole number" }).default(fallback);

// Browsers send the Origin header in exactly this form, so any other spelling would never match.
function isOrigin(value: string): boolean {
  if (!URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value;
}

const apiEnvSchema = z
  .object({
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
              error:
                "must be an origin such as https://example.com, with no path or trailing slash",
            }),
          )
          .min(1, { error: "needs at least one origin" }),
      ),
    // From the Privy dashboard. The app id is public; the secret must stay on the server.
    PRIVY_APP_ID: z.string().min(1),
    PRIVY_APP_SECRET: z.string().min(1),
    // The Solana server the API reads balances from. Solana's public one is fine for development;
    // production uses a provider URL, which carries a key, so it's never logged.
    SOLANA_RPC_URL: z.url({ protocol: /^https?$/ }).default("https://api.mainnet-beta.solana.com"),
    // A secret. Without it, trades are quoted on Jupiter's keyless address, which it plans to retire.
    // Empty counts as unset, so a blank line in .env leaves it off.
    JUPITER_API_KEY: unsetIfEmpty,
    // Off until the legal review. Only "true" or "false", so a typo can't switch fees by surprise.
    FEES_ENABLED: unsetIfEmpty
      .pipe(z.enum(["true", "false"]).default("false"))
      .transform((value) => value === "true"),
    // The platform fee in basis points: 10 is 0.1%. From 0 to 100.
    PLATFORM_FEE_BPS: wholeNumber("10").transform(Number).pipe(z.number().max(100)),
    // The receive-only wallet fees go to; its key is never on a server. Needed when fees are on.
    FEE_WALLET_ADDRESS: unsetIfEmpty.pipe(
      z.string().refine(isSolanaAddress, { error: "must be a Solana address" }).optional(),
    ),
    // The most one trade may be worth, in whole dollars: $5,000 during the beta.
    MAX_TRADE_USD: wholeNumber("5000").transform(Number).pipe(z.number().min(1).max(1_000_000)),
    // The SOL a wallet must hold to trade, for network fees: 0.005 SOL.
    MIN_SOL_FOR_FEES_LAMPORTS: wholeNumber("5000000").transform(BigInt),
    // The highest priority fee a trade offers, per compute unit. Busy pools ran up to 1,000,000 in
    // the P3 spike (ADR 0019), with rare spikes far above; at the cap a large swap pays ~0.0003 SOL.
    MAX_PRIORITY_FEE_MICROLAMPORTS: wholeNumber("1000000").transform(BigInt),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  })
  .refine((env) => !env.FEES_ENABLED || env.FEE_WALLET_ADDRESS !== undefined, {
    path: ["FEE_WALLET_ADDRESS"],
    error: "is needed when FEES_ENABLED is true",
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
