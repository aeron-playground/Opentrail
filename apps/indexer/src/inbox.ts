import { type Database, type Transaction, type WebhookProvider, webhookEvents } from "@repo/db";
import { and, asc, eq, isNull, lt, sql } from "drizzle-orm";

// After this many failed tries an event is set aside: it keeps its last error for a person to
// read, and the processing job stops picking it up, so it never blocks the events behind it.
export const MAX_ATTEMPTS = 5;

export type InboxStats = {
  // Waiting to be processed, not counting the events set aside.
  pending: number;
  // Measured by the database clock, the same clock that stamps received_at.
  oldestPendingSeconds: number | null;
  setAside: number;
};

export type InboxEvent = {
  signature: string;
  payload: unknown;
};

export type PendingEvent = InboxEvent & { id: string };

// The indexer's only way into webhook_events, so every query on that table lives here.
export type Inbox = {
  // Saves each transaction once and returns how many were new. Repeats are skipped, because
  // providers deliver the same event more than once.
  save(provider: WebhookProvider, events: InboxEvent[]): Promise<number>;
  // The oldest events that still wait and haven't been set aside, oldest first.
  nextPending(limit: number): Promise<PendingEvent[]>;
  // Marks the event processed and runs `work` in one database transaction: both happen, or
  // neither. Resolves to false, without running `work`, when the event was already processed.
  complete(id: string, work: (tx: Transaction) => Promise<void>): Promise<boolean>;
  // Counts a failed try and keeps its error. Resolves to how many tries the event has had.
  fail(id: string, error: string): Promise<number>;
  stats(): Promise<InboxStats>;
  // Deletes events processed before the cutoff and returns how many. Unprocessed events stay.
  deleteProcessedBefore(cutoff: Date): Promise<number>;
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

    async nextPending(limit) {
      return db
        .select({
          id: webhookEvents.id,
          signature: webhookEvents.signature,
          payload: webhookEvents.payload,
        })
        .from(webhookEvents)
        .where(and(isNull(webhookEvents.processedAt), lt(webhookEvents.attempts, MAX_ATTEMPTS)))
        .orderBy(asc(webhookEvents.receivedAt))
        .limit(limit);
    },

    async complete(id, work) {
      return db.transaction(async (tx) => {
        // Marking it first locks the row, so a second worker waits here, then finds it done.
        const claimed = await tx
          .update(webhookEvents)
          .set({ processedAt: sql`now()` })
          .where(and(eq(webhookEvents.id, id), isNull(webhookEvents.processedAt)))
          .returning({ id: webhookEvents.id });
        if (claimed.length === 0) {
          return false;
        }
        await work(tx);
        return true;
      });
    },

    async fail(id, error) {
      const [row] = await db
        .update(webhookEvents)
        .set({ attempts: sql`${webhookEvents.attempts} + 1`, lastError: error })
        .where(eq(webhookEvents.id, id))
        .returning({ attempts: webhookEvents.attempts });
      if (row === undefined) {
        throw new Error(`No webhook event ${id}`);
      }
      return row.attempts;
    },

    async stats() {
      const waiting = sql`${webhookEvents.attempts} < ${MAX_ATTEMPTS}`;
      const [row] = await db
        .select({
          pending: sql<number>`(count(*) filter (where ${waiting}))::int`,
          oldestPendingSeconds: sql<number | null>`floor(extract(epoch from now() - min(${
            webhookEvents.receivedAt
          }) filter (where ${waiting})))::int`,
          setAside: sql<number>`(count(*) filter (where not ${waiting}))::int`,
        })
        .from(webhookEvents)
        .where(isNull(webhookEvents.processedAt));
      return {
        pending: row?.pending ?? 0,
        oldestPendingSeconds: row?.oldestPendingSeconds ?? null,
        setAside: row?.setAside ?? 0,
      };
    },

    async deleteProcessedBefore(cutoff) {
      const deleted = await db
        .delete(webhookEvents)
        // Never true while processed_at is null, so unprocessed events are never deleted.
        .where(lt(webhookEvents.processedAt, cutoff))
        .returning({ id: webhookEvents.id });
      return deleted.length;
    },
  };
}
