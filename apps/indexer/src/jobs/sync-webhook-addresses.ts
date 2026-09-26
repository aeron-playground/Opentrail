import type { Logger } from "@repo/server";
import type { HeliusWebhooks } from "../providers/helius/types";
import type { WatchList } from "../watch-list";
import type { Job } from "./scheduler";

export const SYNC_EVERY_MS = 30_000;
// Each edit costs Helius credits, so one edit takes a large batch.
const BATCH_SIZE = 5_000;

export type SyncWebhookAddressesDeps = {
  watchList: WatchList;
  helius: HeliusWebhooks;
  logger: Logger;
};

// Helius only delivers transactions of the addresses it watches, so each new user's wallet is
// added to our webhook. A run with no new users makes no call to Helius.
export function syncWebhookAddressesJob({
  watchList,
  helius,
  logger,
}: SyncWebhookAddressesDeps): Job {
  return {
    name: "sync-webhook-addresses",
    everyMs: SYNC_EVERY_MS,
    run: async () => {
      const unwatched = await watchList.unwatched(BATCH_SIZE);
      if (unwatched.length === 0) {
        return;
      }
      const watching = await helius.addAddresses(unwatched.map((user) => user.walletAddress));
      // Only after Helius said yes: if marking fails, the next run adds them again, which is safe.
      await watchList.markWatched(unwatched.map((user) => user.userId));
      logger.info({ added: unwatched.length, watching }, "wallets added to the Helius webhook");
    },
  };
}
