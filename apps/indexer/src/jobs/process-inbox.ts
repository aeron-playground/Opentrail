import type { Logger } from "@repo/server";
import { type Inbox, MAX_ATTEMPTS } from "../inbox";
import { normalizeRpcTransaction } from "../ingest/normalize-rpc";
import { recordTransaction } from "../ingest/record";
import type { Job } from "./scheduler";

// Deposits should show up within a second or two of Helius delivering them.
export const PROCESS_EVERY_MS = 1_000;
const BATCH_SIZE = 50;
// Enough to read what went wrong; the event keeps the full transaction.
const MAX_ERROR_LENGTH = 500;

export type ProcessInboxDeps = {
  inbox: Pick<Inbox, "nextPending" | "complete" | "fail">;
  logger: Logger;
};

// Turns saved Helius deliveries into transfers, oldest first. Each event is processed in its own
// database transaction, so one broken event never undoes or blocks the others.
export function processInboxJob({ inbox, logger }: ProcessInboxDeps): Job {
  return {
    name: "process-inbox",
    everyMs: PROCESS_EVERY_MS,
    run: async () => {
      for (const event of await inbox.nextPending(BATCH_SIZE)) {
        try {
          let deposits = 0;
          await inbox.complete(event.id, async (tx) => {
            ({ deposits } = await recordTransaction(tx, normalizeRpcTransaction(event.payload)));
          });
          // Logged after the commit, so it never reports a deposit that was rolled back.
          if (deposits > 0) {
            logger.info({ signature: event.signature, deposits }, "deposits recorded");
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const attempts = await inbox.fail(event.id, message.slice(0, MAX_ERROR_LENGTH));
          const details = { err: error, eventId: event.id, signature: event.signature, attempts };
          if (attempts >= MAX_ATTEMPTS) {
            logger.error(details, "webhook event set aside after failing too often");
          } else {
            logger.warn(details, "webhook event failed; it will be tried again");
          }
        }
      }
    },
  };
}
