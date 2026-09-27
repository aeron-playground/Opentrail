// Turns the indexer's Postgres notifications into messages for the connected users.
import { BALANCE_CHANGED_CHANNEL, type DbHandle } from "@repo/db";
import type { Logger } from "@repo/server";
import { WS_PROTOCOL_VERSION } from "@repo/shared/ws";
import { z } from "zod";
import type { Hub } from "./hub";

const UserId = z.uuid();
const RETRY_MS = 5_000;

export type ForwardDeps = {
  listen: DbHandle["listen"];
  hub: Pick<Hub, "sendToUser">;
  logger: Logger;
  retryMs?: number;
};

export type Forwarding = {
  // Resolves once listening; it may take several tries.
  listening: Promise<void>;
  stop(): Promise<void>;
};

// Listens in the background and tries again every few seconds while Postgres doesn't answer, so
// the API starts and serves HTTP even when the database is down. Once listening, the connection
// reconnects by itself. A notification sent while it's down is lost; Add funds still checks
// balances every 5 seconds for that case.
export function forwardBalanceChanges({
  listen,
  hub,
  logger,
  retryMs = RETRY_MS,
}: ForwardDeps): Forwarding {
  let stopped = false;
  let unlisten: (() => Promise<void>) | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const listening = Promise.withResolvers<void>();

  const onMessage = (payload: string) => {
    const userId = UserId.safeParse(payload);
    if (!userId.success) {
      logger.warn("balance_changed notification without a user id");
      return;
    }
    hub.sendToUser(userId.data, { v: WS_PROTOCOL_VERSION, type: "balance.changed" });
  };

  async function attempt() {
    try {
      const stop = await listen(BALANCE_CHANGED_CHANNEL, onMessage);
      if (stopped) {
        await stop();
        return;
      }
      unlisten = stop;
      listening.resolve();
    } catch (error) {
      if (stopped) {
        return;
      }
      logger.warn({ err: error }, "can't listen for balance changes yet; trying again");
      retry = setTimeout(attempt, retryMs);
    }
  }
  void attempt();

  return {
    listening: listening.promise,
    async stop() {
      stopped = true;
      clearTimeout(retry);
      await unlisten?.();
    },
  };
}
