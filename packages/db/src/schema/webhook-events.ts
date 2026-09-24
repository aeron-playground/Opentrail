// Writer: indexer.
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const WEBHOOK_PROVIDERS = ["helius"] as const;
export type WebhookProvider = (typeof WEBHOOK_PROVIDERS)[number];

const providerList = sql.raw(WEBHOOK_PROVIDERS.map((provider) => `'${provider}'`).join(", "));

// The inbox for webhook deliveries: saved as they arrive, processed later by a job. One row per
// transaction, so a delivery that arrives twice is stored once.
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    provider: text("provider", { enum: WEBHOOK_PROVIDERS }).notNull(),
    signature: text("signature").notNull(),
    // The transaction exactly as the provider sent it. Public on-chain data only.
    payload: jsonb("payload").$type<unknown>().notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
  },
  (table) => [
    unique("webhook_events_provider_signature_unique").on(table.provider, table.signature),
    // The processing job reads only events that still wait, oldest first.
    index("webhook_events_pending_idx")
      .on(table.receivedAt)
      .where(sql`${table.processedAt} is null`),
    check("webhook_events_provider_check", sql`${table.provider} in (${providerList})`),
    check("webhook_events_attempts_check", sql`${table.attempts} >= 0`),
  ],
);

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
