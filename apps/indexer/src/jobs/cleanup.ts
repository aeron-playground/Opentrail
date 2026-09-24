import type { Logger } from "@repo/server";
import type { Inbox } from "../inbox";
import type { Job } from "./scheduler";

const DAY_MS = 24 * 60 * 60 * 1000;

// Processed webhook events are kept this long, for replays and investigations.
export const RETENTION_DAYS = 30;

export type CleanupDeps = {
  inbox: Pick<Inbox, "deleteProcessedBefore">;
  logger: Logger;
  now?: () => Date;
};

export function cleanupJob({ inbox, logger, now = () => new Date() }: CleanupDeps): Job {
  return {
    name: "cleanup",
    everyMs: DAY_MS,
    run: async () => {
      const cutoff = new Date(now().getTime() - RETENTION_DAYS * DAY_MS);
      const deleted = await inbox.deleteProcessedBefore(cutoff);
      if (deleted > 0) {
        logger.info({ deleted, cutoff }, "old webhook events deleted");
      }
    },
  };
}
