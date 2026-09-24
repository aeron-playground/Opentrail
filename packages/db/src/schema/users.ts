// Writer: api. The indexer only sets webhook_registered_at.
import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { citext } from "./columns";

export const USER_STATUSES = ["active", "banned", "deleted"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

const statusList = sql.raw(USER_STATUSES.map((status) => `'${status}'`).join(", "));

export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    privyDid: text("privy_did").notNull().unique(),
    // Read from the auth provider on the server, never from the request.
    walletAddress: text("wallet_address").notNull().unique(),
    username: citext("username").notNull().unique(),
    usernameChangedAt: timestamp("username_changed_at", { withTimezone: true }),
    status: text("status", { enum: USER_STATUSES }).notNull().default("active"),
    webhookRegisteredAt: timestamp("webhook_registered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [check("users_status_check", sql`${table.status} in (${statusList})`)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
