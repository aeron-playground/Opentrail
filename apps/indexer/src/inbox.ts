import { type Database, type WebhookProvider, webhookEvents } from "@repo/db";
import { count, isNull, sql } from "drizzle-orm";

export type InboxStats = {
  pending: number;
  // Measured by the database clock, the same clock that stamps received_at.
  oldestPendingSeconds: number | null;
};

export type InboxEvent = {
  signature: string;
  payload: unknown;
};

// The indexer's only way into webhook_events, so every query on that table lives here.
export type Inbox = {
  // Saves each transaction once and returns how many were new. Repeats are skipped, because
  // providers deliver the same event more than once.
  save(provider: WebhookProvider, events: InboxEvent[]): Promise<number>;
  stats(): Promise<InboxStats>;
};

export function createInbox(db: Database): Inbox {
  return {
    async save(provider, events) {
      if (events.length === 0) {
        return 0;
      }
      const saved = await db
        .insert(webhookEvents)
        .values(events.map(({ signature, payload }) => ({ provider, signature, payload })))
        .onConflictDoNothing()
        .returning({ id: webhookEvents.id });
      return saved.length;
    },

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
