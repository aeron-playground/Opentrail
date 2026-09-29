// Sends the indexer's price changes to the prices channel: at most one message every few seconds,
// with every change since the last one.
import { PRICE_UPDATED_CHANNEL } from "@repo/db";
import { WS_PRICE_INTERVAL_MS, WS_PROTOCOL_VERSION } from "@repo/shared/ws";
import { isSolanaAddress } from "@repo/solana";
import type { PriceReader } from "../services/prices";
import type { Hub } from "./hub";
import { type Forwarding, type ListenDeps, listenInBackground } from "./listen";

export type PriceForwardDeps = ListenDeps & {
  prices: PriceReader;
  hub: Pick<Hub, "broadcast" | "subscribers">;
  intervalMs?: number;
};

export function forwardPriceChanges({
  prices,
  hub,
  intervalMs = WS_PRICE_INTERVAL_MS,
  ...deps
}: PriceForwardDeps): Forwarding {
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastSent = Number.NEGATIVE_INFINITY;

  async function send() {
    timer = undefined;
    const mints = [...pending];
    pending.clear();
    // Nobody listening: nothing to read or send. The next change goes out at once.
    if (hub.subscribers("prices") === 0) {
      return;
    }
    lastSent = Date.now();
    try {
      // Read now, so the message has the newest prices, not the ones at notification time.
      const items = await prices.current(mints);
      if (items.length > 0) {
        hub.broadcast("prices", { v: WS_PROTOCOL_VERSION, type: "price", items });
      }
    } catch (error) {
      deps.logger.error({ err: error }, "couldn't read prices for the prices channel");
    }
  }

  const forwarding = listenInBackground(
    PRICE_UPDATED_CHANNEL,
    (payload) => {
      for (const mint of payload.split(",")) {
        if (isSolanaAddress(mint)) {
          pending.add(mint);
        } else {
          deps.logger.warn("price_updated notification with a part that isn't a mint");
        }
      }
      if (pending.size > 0 && timer === undefined) {
        timer = setTimeout(send, Math.max(0, lastSent + intervalMs - Date.now()));
      }
    },
    deps,
  );

  return {
    listening: forwarding.listening,
    async stop() {
      clearTimeout(timer);
      await forwarding.stop();
    },
  };
}
