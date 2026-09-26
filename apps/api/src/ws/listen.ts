// Turns the indexer's Postgres notifications into messages for the connected users.
import { BALANCE_CHANGED_CHANNEL, type DbHandle } from "@repo/db";
import type { Logger } from "@repo/server";
import { WS_PROTOCOL_VERSION } from "@repo/shared";
import { z } from "zod";
import type { Hub } from "./hub";

const UserId = z.uuid();

export type ForwardDeps = {
  listen: DbHandle["listen"];
  hub: Pick<Hub, "sendToUser">;
  logger: Logger;
};

// Resolves once listening, to a function that stops. A notification sent while the listening
// connection is down is lost; Add funds still checks balances every 5 seconds for that case.
export function forwardBalanceChanges({ listen, hub, logger }: ForwardDeps) {
  return listen(BALANCE_CHANGED_CHANNEL, (payload) => {
    const userId = UserId.safeParse(payload);
    if (!userId.success) {
      logger.warn("balance_changed notification without a user id");
      return;
    }
    hub.sendToUser(userId.data, { v: WS_PROTOCOL_VERSION, type: "balance.changed" });
  });
}
