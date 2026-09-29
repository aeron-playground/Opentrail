// Turns the indexer's Postgres notifications into messages for the connected users.
import { BALANCE_CHANGED_CHANNEL, type DbHandle } from "@repo/db";
import type { Logger } from "@repo/server";
import { WS_PROTOCOL_VERSION } from "@repo/shared/ws";
import { z } from "zod";
import type { Hub } from "./hub";

const UserId = z.uuid();
const RETRY_MS = 5_000;

export type ListenDeps = {
  listen: DbHandle["listen"];
  logger: Logger;
  retryMs?: number;
};

export type ForwardDeps = ListenDeps & { hub: Pick<Hub, "sendToUser"> };

export type Forwarding = {
  // Resolves once listening; it may take several tries.
  listening: Promise<void>;
  stop(): Promise<void>;
};

// Listens on `channel` in the background and tries again every few seconds while Postgres doesn't
// answer, so the API starts and serves HTTP even when the database is down. Once listening, the
// connection reconnects by itself. A notification sent while it's down is lost.
export function listenInBackground(
  channel: string,
  onMessage: (payload: string) => void,
  { listen, logger, retryMs = RETRY_MS }: ListenDeps,
): Forwarding {
  let stopped = false;
  let unlisten: (() => Promise<void>) | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const listening = Promise.withResolvers<void>();

  async function attempt() {
    try {
      const stop = await listen(channel, onMessage);
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
      logger.warn({ err: error, channel }, "can't listen to the database yet; trying again");
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

// Add funds still checks balances every 5 seconds, for a notification lost while listening was down.
export function forwardBalanceChanges({ hub, ...deps }: ForwardDeps): Forwarding {
  return listenInBackground(
    BALANCE_CHANGED_CHANNEL,
    (payload) => {
      const userId = UserId.safeParse(payload);
      if (!userId.success) {
        deps.logger.warn("balance_changed notification without a user id");
        return;
      }
      hub.sendToUser(userId.data, { v: WS_PROTOCOL_VERSION, type: "balance.changed" });
    },
    deps,
  );
}
