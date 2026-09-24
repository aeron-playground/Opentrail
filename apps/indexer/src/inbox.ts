import { type Database, webhookEvents } from "@repo/db";
import { count, isNull, sql } from "drizzle-orm";

export type InboxStats = {
  pending: number;
  // Measured by the database clock, the same clock that stamps received_at.
  oldestPendingSeconds: number | null;
};

// The indexer's only way into webhook_events, so every query on that table lives here.
export type Inbox = {
  stats(): Promise<InboxStats>;
};

export function createInbox(db: Database): Inbox {
  return {
    async stats() {
      const [row] = await db
        .select({
          pending: count(),
          oldestPendingSeconds: sql<
            number | null
          >`floor(extract(epoch from now() - min(${webhookEvents.receivedAt})))::int`,
        })
        .from(webhookEvents)
        .where(isNull(webhookEvents.processedAt));
      return {
        pending: row?.pending ?? 0,
        oldestPendingSeconds: row?.oldestPendingSeconds ?? null,
      };
    },
  };
}
