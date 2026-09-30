import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import {
  WS_CLOSE_CODES,
  WS_RECONNECT_MAX_MS,
  WS_RECONNECT_MIN_MS,
  type WsServerMessage,
} from "@repo/shared/ws";
import { fakeSockets } from "../test/fake-socket";
import { type LiveConnectionOptions, reconnectDelay, startLiveConnection } from "./ws";

const URL = "ws://localhost:3001/v1/ws";
const BALANCE_CHANGED: WsServerMessage = { v: 1, type: "balance.changed" };
const SUBSCRIBED: WsServerMessage = { v: 1, type: "subscribed", channel: "me" };

// Lets the awaited token and the listeners that wait for it run.
const settle = async () => {
  for (let step = 0; step < 5; step += 1) {
    await Promise.resolve();
  }
};

function setup(overrides: Partial<LiveConnectionOptions> = {}) {
  const fakes = fakeSockets();
  const received: WsServerMessage[] = [];
  const connection = startLiveConnection({
    url: URL,
    getToken: async () => "a-token",
    channels: ["me"],
    onMessage: (message) => received.push(message),
    createSocket: fakes.create,
    // The longest wait each time, so the tests know exactly when a retry comes.
    random: () => 1,
    ...overrides,
  });
  return { connection, sockets: fakes.all, received, latest: fakes.latest };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("startLiveConnection", () => {
  test("signs in and subscribes to me once connected", async () => {
    const { latest } = setup();
    latest().opened();
    await settle();

    expect(latest().sent).toEqual([
      { type: "auth", token: "a-token" },
      { type: "subscribe", channel: "me" },
    ]);
  });

  test("passes on the messages it knows, and skips the rest", () => {
    const { latest, received } = setup();
    const price: WsServerMessage = {
      v: 1,
      type: "price",
      items: [{ mint: "made-up-mint", priceUsd: "1.5", change24hPct: null }],
    };
    latest().receive(JSON.stringify(BALANCE_CHANGED));
    latest().receive(JSON.stringify(price));
    latest().receive(JSON.stringify({ v: 1, type: "alert.trade", trade: {} }));
    latest().receive("not json");
    latest().receive(new Uint8Array([1]));

    expect(received).toEqual([BALANCE_CHANGED, price]);
  });

  test.each([
    ["no token", async () => null],
    ["a token that failed to load", () => Promise.reject(new Error("Privy is down"))],
  ])("closes without signing in when there's %s", async (_, getToken) => {
    const { latest } = setup({ getToken });
    latest().opened();
    await settle();

    expect(latest().sent).toEqual([]);
    expect(latest().closedWith).toBe(1000);
  });

  test("waits longer after each failed try, and starts over after a subscribe", () => {
    const { sockets, latest } = setup();

    latest().dropped();
    jest.advanceTimersByTime(WS_RECONNECT_MIN_MS - 1);
    expect(sockets).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    latest().dropped();
    jest.advanceTimersByTime(2 * WS_RECONNECT_MIN_MS - 1);
    expect(sockets).toHaveLength(2);
    jest.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    latest().receive(JSON.stringify(SUBSCRIBED));
    latest().dropped();
    jest.advanceTimersByTime(WS_RECONNECT_MIN_MS);
    expect(sockets).toHaveLength(4);
  });

  test("waits the longest time when the user has too many connections", () => {
    const { sockets, latest } = setup();

    latest().dropped(WS_CLOSE_CODES.TOO_MANY_CONNECTIONS);
    jest.advanceTimersByTime(WS_RECONNECT_MAX_MS - 1);
    expect(sockets).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
  });

  test("ignores an old socket after reconnecting", () => {
    const { sockets, latest, received } = setup();
    const old = latest();
    old.dropped();
    jest.advanceTimersByTime(WS_RECONNECT_MIN_MS);

    old.receive(JSON.stringify(BALANCE_CHANGED));
    old.dropped();
    jest.advanceTimersByTime(WS_RECONNECT_MAX_MS);

    expect(received).toEqual([]);
    expect(sockets).toHaveLength(2);
  });

  test("stop closes the socket and never reconnects", () => {
    const { connection, sockets, latest } = setup();
    const socket = latest();

    connection.stop();
    socket.dropped();
    jest.advanceTimersByTime(WS_RECONNECT_MAX_MS);

    expect(socket.closedWith).toBe(1000);
    expect(sockets).toHaveLength(1);
  });

  test("stop cancels a retry that was waiting", () => {
    const { connection, sockets, latest } = setup();
    latest().dropped();

    connection.stop();
    jest.advanceTimersByTime(WS_RECONNECT_MAX_MS);

    expect(sockets).toHaveLength(1);
  });

  test("sends nothing when stopped while the token was on its way", async () => {
    const token = Promise.withResolvers<string | null>();
    const { connection, latest } = setup({ getToken: () => token.promise });
    latest().opened();

    connection.stop();
    token.resolve("a-token");
    await settle();

    expect(latest().sent).toEqual([]);
  });
});

describe("channels", () => {
  test("signs in, then subscribes to every wanted channel", async () => {
    const { latest } = setup({ channels: ["me", "prices"] });
    latest().opened();
    await settle();
    expect(latest().sent).toEqual([
      { type: "auth", token: "a-token" },
      { type: "subscribe", channel: "me" },
      { type: "subscribe", channel: "prices" },
    ]);
  });

  test("without sign-in, subscribes to the public channels only", async () => {
    const { latest } = setup({ getToken: async () => null, channels: ["me", "prices"] });
    latest().opened();
    await settle();
    expect(latest().sent).toEqual([{ type: "subscribe", channel: "prices" }]);
    expect(latest().closedWith).toBeNull();
  });

  test("adds a channel to an open connection at once, and once only", async () => {
    const { connection, latest } = setup();
    latest().opened();
    await settle();

    connection.subscribe("prices");
    connection.subscribe("prices");
    connection.subscribe("me");

    expect(latest().sent).toEqual([
      { type: "auth", token: "a-token" },
      { type: "subscribe", channel: "me" },
      { type: "subscribe", channel: "prices" },
    ]);
  });

  test("keeps a channel added before the socket is ready for when it opens", async () => {
    const { connection, latest } = setup({ getToken: async () => null, channels: [] });
    connection.subscribe("prices");
    latest().opened();
    await settle();
    expect(latest().sent).toEqual([{ type: "subscribe", channel: "prices" }]);
  });

  test("doesn't send a signed-in channel added to a connection without sign-in", async () => {
    const { connection, latest } = setup({ getToken: async () => null, channels: ["prices"] });
    latest().opened();
    await settle();
    connection.subscribe("me");
    expect(latest().sent).toEqual([{ type: "subscribe", channel: "prices" }]);
  });

  test("subscribes to every channel again after a reconnect", async () => {
    const { connection, latest } = setup();
    latest().opened();
    await settle();
    connection.subscribe("prices");

    latest().dropped();
    jest.advanceTimersByTime(WS_RECONNECT_MIN_MS);
    latest().opened();
    await settle();

    expect(latest().sent).toEqual([
      { type: "auth", token: "a-token" },
      { type: "subscribe", channel: "me" },
      { type: "subscribe", channel: "prices" },
    ]);
  });
});

describe("reconnectDelay", () => {
  test.each([
    [0, 0, 500],
    [0, 1, 1_000],
    [1, 1, 2_000],
    [3, 0, 4_000],
    [3, 1, 8_000],
    [10, 0, 15_000],
    [10, 1, 30_000],
  ])("after %i failed tries, with random %d, waits %i ms", (failures, random, expected) => {
    expect(reconnectDelay(failures, () => random)).toBe(expected);
  });
});
