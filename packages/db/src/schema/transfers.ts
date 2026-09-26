// Writer: indexer.
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const TRANSFER_DIRECTIONS = ["in", "out"] as const;
export type TransferDirection = (typeof TRANSFER_DIRECTIONS)[number];

// Only deposits are recorded so far; the other kinds arrive with trading and withdrawals.
export const TRANSFER_KINDS = [
  "deposit",
  "withdrawal",
  "network_fee",
  "rent",
  "adjustment",
  "other",
] as const;
export type TransferKind = (typeof TRANSFER_KINDS)[number];

const quoted = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));

// Tokens and SOL that moved into or out of a user's wallet, other than trades. The ledger for
// profit and loss is built from these and from trades.
export const transfers = pgTable(
  "transfers",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    walletAddress: text("wallet_address").notNull(),
    signature: text("signature").notNull(),
    slot: bigint("slot", { mode: "bigint" }).notNull(),
    blockTime: timestamp("block_time", { withTimezone: true }).notNull(),
    direction: text("direction", { enum: TRANSFER_DIRECTIONS }).notNull(),
    // Native SOL is stored under the wSOL mint, like every other table.
    mint: text("mint").notNull(),
    // In the token's smallest unit; up to 40 digits, so no amount ever loses a digit.
    amountRaw: numeric("amount_raw", { precision: 40, scale: 0, mode: "bigint" }).notNull(),
    // The other side, when the transaction shows exactly one.
    counterparty: text("counterparty"),
    kind: text("kind", { enum: TRANSFER_KINDS }).notNull(),
    // What it was worth when it arrived, where known: USDC counts one to one.
    usdValueMicro: bigint("usd_value_micro", { mode: "bigint" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A transaction processed twice still makes one row.
    unique("transfers_signature_user_mint_direction_kind_unique").on(
      table.signature,
      table.userId,
      table.mint,
      table.direction,
      table.kind,
    ),
    index("transfers_user_time_idx").on(table.userId, table.blockTime.desc()),
    check("transfers_direction_check", sql`${table.direction} in (${quoted(TRANSFER_DIRECTIONS)})`),
    check("transfers_kind_check", sql`${table.kind} in (${quoted(TRANSFER_KINDS)})`),
    check("transfers_amount_check", sql`${table.amountRaw} > 0`),
  ],
);

export type Transfer = typeof transfers.$inferSelect;
export type NewTransfer = typeof transfers.$inferInsert;
