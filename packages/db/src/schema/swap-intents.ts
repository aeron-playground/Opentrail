// Writer: api. The indexer may also set a swap `confirmed`, since status only moves forward.

import { SWAP_STATUSES } from "@repo/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// Swaps come first; withdrawals and network fee top-ups use the same table later.
export const INTENT_KINDS = ["swap", "withdraw", "gas_topup"] as const;
export type IntentKind = (typeof INTENT_KINDS)[number];

export const SWAP_SIDES = ["buy", "sell"] as const;
export type SwapSide = (typeof SWAP_SIDES)[number];

// built → submitted → confirmed | failed | expired, and never backwards: the same for every app.
export const INTENT_STATUSES = SWAP_STATUSES;
export type IntentStatus = (typeof INTENT_STATUSES)[number];

export const SWAP_PROVIDERS = ["jupiter", "titan", "internal"] as const;
export type SwapProviderName = (typeof SWAP_PROVIDERS)[number];

const quoted = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));
// Raw token units, up to 40 digits, so no amount ever loses a digit.
const rawAmount = (name: string) => numeric(name, { precision: 40, scale: 0, mode: "bigint" });

// A transaction the API built for a user to sign: what it does, and the hash of its message, so
// the signed transaction that comes back can be checked against it (ADR 0006).
export const swapIntents = pgTable(
  "swap_intents",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind", { enum: INTENT_KINDS }).notNull().default("swap"),
    // Swaps only.
    side: text("side", { enum: SWAP_SIDES }),
    // Native SOL is stored under the wSOL mint, like every other table.
    inputMint: text("input_mint").notNull(),
    outputMint: text("output_mint").notNull(),
    // For a buy, the USDC spent including the fee; for a sell, the tokens sold.
    inAmountRaw: rawAmount("in_amount_raw").notNull(),
    expectedOutRaw: rawAmount("expected_out_raw"),
    minOutRaw: rawAmount("min_out_raw"),
    feeBps: integer("fee_bps").notNull().default(0),
    // As SQL: the migration tool can't write a bigint default into its JSON snapshot.
    feeUsdcMicro: bigint("fee_usdc_micro", { mode: "bigint" }).notNull().default(sql`0`),
    slippageBps: integer("slippage_bps"),
    priceImpactBps: integer("price_impact_bps"),
    provider: text("provider", { enum: SWAP_PROVIDERS }),
    routeLabel: text("route_label"),
    // Withdrawals only.
    destinationAddress: text("destination_address"),
    // SHA-256 of the message bytes we built, as lowercase hex.
    messageHash: text("message_hash").notNull(),
    // Past this block height, the transaction can never land.
    lastValidBlockHeight: bigint("last_valid_block_height", { mode: "bigint" }).notNull(),
    status: text("status", { enum: INTENT_STATUSES }).notNull().default("built"),
    signature: text("signature").unique(),
    errorCode: text("error_code"),
    errorDetail: text("error_detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("swap_intents_user_time_idx").on(table.userId, table.createdAt.desc()),
    check("swap_intents_kind_check", sql`${table.kind} in (${quoted(INTENT_KINDS)})`),
    check("swap_intents_side_check", sql`${table.side} in (${quoted(SWAP_SIDES)})`),
    check("swap_intents_status_check", sql`${table.status} in (${quoted(INTENT_STATUSES)})`),
    check("swap_intents_provider_check", sql`${table.provider} in (${quoted(SWAP_PROVIDERS)})`),
    check("swap_intents_in_amount_check", sql`${table.inAmountRaw} > 0`),
    check(
      "swap_intents_min_out_check",
      sql`${table.minOutRaw} >= 0 and ${table.minOutRaw} <= ${table.expectedOutRaw}`,
    ),
    check("swap_intents_fee_check", sql`${table.feeBps} >= 0 and ${table.feeUsdcMicro} >= 0`),
    check("swap_intents_message_hash_check", sql`${table.messageHash} ~ '^[0-9a-f]{64}$'`),
    // A swap always says which way it goes and what it should bring.
    check(
      "swap_intents_swap_fields_check",
      sql`${table.kind} <> 'swap' or (${table.side} is not null and ${table.expectedOutRaw} is not null and ${table.minOutRaw} is not null and ${table.provider} is not null)`,
    ),
  ],
);

export type SwapIntent = typeof swapIntents.$inferSelect;
export type NewSwapIntent = typeof swapIntents.$inferInsert;
