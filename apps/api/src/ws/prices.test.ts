import { describe, expect, test } from "bun:test";
import type { WsServerMessage } from "@repo/shared/ws";
import type { CurrentPrice } from "../services/prices";
import { capturedLogger } from "../testing";
import { forwardPriceChanges } from "./prices";

// Real mints (public): the forwarder only passes on valid addresses.
const SOL = "So11111111111111111111111111111111111111112";
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const INTERVAL_MS = 40;

const priceOf = (mint: string): CurrentPrice => ({ mint, priceUsd: "1", change24hPct: null });

function setup({ subscribers = 1, failReads = false } = {}) {
  let notify: (payload: string) => void = () => {};
  const reads: string[][] = [];
  const sent: WsServerMessage[] = [];
  const { logger, lines } = capturedLogger();
  const forwarding = forwardPriceChanges({
    listen: async (_channel, onMessage) => {
      notify = onMessage;
      return async () => {};
    },
    logger,
    intervalMs: INTERVAL_MS,
    prices: {
      current: async (mints) => {
        reads.push([...mints].sort());
        if (failReads) throw new Error("database down");
        return [...mints].sort().map(priceOf);
      },
    },
    hub: {
      subscribers: () => subscribers,
      broadcast: (_channel, message) => {
        sent.push(message);
        return subscribers;
      },
    },
  });
  return { forwarding, notify: (payload: string) => notify(payload), reads, sent, lines };
}

const itemsOf = (message: WsServerMessage | undefined) =>
  message?.type === "price" ? message.items.map((item) => item.mint) : [];

describe("forwardPriceChanges", () => {
  test("sends the first change at once, with the newest stored prices", async () => {
    const { forwarding, notify, sent } = setup();
    await forwarding.listening;

    notify(`${SOL},${BONK}`);
    await Bun.sleep(5);

    expect(sent).toEqual([{ v: 1, type: "price", items: [priceOf(BONK), priceOf(SOL)] }]);
    await forwarding.stop();
  });

  test("merges the changes of the next few seconds into one message", async () => {
    const { forwarding, notify, sent } = setup();
    await forwarding.listening;
    notify(SOL);
    await Bun.sleep(5);

    notify(BONK);
    notify(`${JUP},${BONK}`);
    await Bun.sleep(5);
    expect(sent).toHaveLength(1);

    await Bun.sleep(INTERVAL_MS);
    expect(sent).toHaveLength(2);
    expect(itemsOf(sent[1])).toEqual([BONK, JUP].sort());
    await forwarding.stop();
  });

  test("reads nothing while nobody is subscribed", async () => {
    const { forwarding, notify, reads, sent } = setup({ subscribers: 0 });
    await forwarding.listening;

    notify(SOL);
    await Bun.sleep(5);

    expect(reads).toEqual([]);
    expect(sent).toEqual([]);
    await forwarding.stop();
  });

  test("skips parts that aren't mints, and sends the rest", async () => {
    const { forwarding, notify, sent, lines } = setup();
    await forwarding.listening;

    notify(`not-a-mint,${SOL}`);
    notify("also-not-a-mint");
    await Bun.sleep(5);

    expect(itemsOf(sent[0])).toEqual([SOL]);
    expect(lines.filter((line) => line.level === "warn")).toHaveLength(2);
    await forwarding.stop();
  });

  test("logs a failed read, and still sends later changes", async () => {
    const { forwarding, notify, lines, reads } = setup({ failReads: true });
    await forwarding.listening;

    notify(SOL);
    await Bun.sleep(5);
    notify(BONK);
    await Bun.sleep(INTERVAL_MS + 5);

    expect(lines.filter((line) => line.level === "error")).toHaveLength(2);
    expect(reads).toEqual([[SOL], [BONK]]);
    await forwarding.stop();
  });

  test("stop cancels a message that was waiting", async () => {
    const { forwarding, notify, sent } = setup();
    await forwarding.listening;
    notify(SOL);
    await Bun.sleep(5);
    notify(BONK);

    await forwarding.stop();
    await Bun.sleep(INTERVAL_MS + 5);

    expect(sent).toHaveLength(1);
  });
});
