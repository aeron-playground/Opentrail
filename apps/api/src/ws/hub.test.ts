import { describe, expect, test } from "bun:test";
import { AppError } from "@repo/server";
import { WS_CLOSE_CODES, WS_MAX_CONNECTIONS_PER_USER, type WsServerMessage } from "@repo/shared";
import { createFakePrivy } from "../providers/privy/fake";
import { capturedLogger } from "../testing";
import { createHub, type HubDeps, type Peer } from "./hub";

type FakePeer = Peer & {
  received: WsServerMessage[];
  closedWith: { code?: number; reason?: string } | null;
  terminated: boolean;
  pings: number;
};

function fakePeer(): FakePeer {
  const peer: FakePeer = {
    received: [],
    closedWith: null,
    terminated: false,
    pings: 0,
    send: (text) => peer.received.push(JSON.parse(text)),
    close: (code, reason) => {
      peer.closedWith = { code, reason };
    },
    terminate: () => {
      peer.terminated = true;
    },
    ping: () => {
      peer.pings += 1;
    },
  };
  return peer;
}

const BALANCE_CHANGED: WsServerMessage = { v: 1, type: "balance.changed" };
const json = (value: unknown) => JSON.stringify(value);
const errorCodes = (peer: FakePeer) =>
  peer.received.flatMap((message) => (message.type === "error" ? [message.code] : []));

// A hub with a fake Privy. Each signed-in person's account id is "user-<n>".
function setup(overrides: Partial<HubDeps> = {}) {
  const privy = createFakePrivy();
  const accounts = new Map<string, string>();
  const { logger, lines } = capturedLogger();
  const hub = createHub({
    privy,
    userIdFor: async (privyDid) => {
      const id = accounts.get(privyDid);
      if (id === undefined) {
        throw new Error("No account in this test");
      }
      return id;
    },
    logger,
    ...overrides,
  });
  let next = 0;
  const person = () => {
    const signedIn = privy.signIn();
    next += 1;
    const userId = `user-${next}`;
    accounts.set(signedIn.privyDid, userId);
    return { token: signedIn.token, userId };
  };
  // A connection signed in as `token` and subscribed to `me`.
  const subscribed = async (token: string) => {
    const peer = fakePeer();
    hub.open(peer);
    await hub.message(peer, json({ type: "auth", token }));
    await hub.message(peer, json({ type: "subscribe", channel: "me" }));
    return peer;
  };
  return { hub, person, subscribed, lines };
}

describe("auth and subscribe", () => {
  test("a signed-in connection subscribes to me and gets its events", async () => {
    const { hub, person, subscribed } = setup();
    const maya = person();
    const peer = await subscribed(maya.token);

    expect(peer.received).toEqual([{ v: 1, type: "subscribed", channel: "me" }]);
    expect(hub.sendToUser(maya.userId, BALANCE_CHANGED)).toBe(1);
    expect(peer.received.at(-1)).toEqual(BALANCE_CHANGED);
  });

  test("a subscribe sent right behind the auth waits for it", async () => {
    const { hub, person } = setup();
    const peer = fakePeer();
    hub.open(peer);

    void hub.message(peer, json({ type: "auth", token: person().token }));
    await hub.message(peer, json({ type: "subscribe", channel: "me" }));

    expect(peer.received).toEqual([{ v: 1, type: "subscribed", channel: "me" }]);
  });

  test("me needs auth first", async () => {
    const { hub } = setup();
    const peer = fakePeer();
    hub.open(peer);

    await hub.message(peer, json({ type: "subscribe", channel: "me" }));

    expect(errorCodes(peer)).toEqual(["UNAUTHORIZED"]);
  });

  test("a token that isn't valid is refused, and a valid one still works after it", async () => {
    const { hub, person } = setup();
    const maya = person();
    const peer = fakePeer();
    hub.open(peer);

    await hub.message(peer, json({ type: "auth", token: "not-a-real-token" }));
    await hub.message(peer, json({ type: "auth", token: maya.token }));
    await hub.message(peer, json({ type: "subscribe", channel: "me" }));

    expect(errorCodes(peer)).toEqual(["UNAUTHORIZED"]);
    expect(hub.sendToUser(maya.userId, BALANCE_CHANGED)).toBe(1);
  });

  test("passes on the account's error, such as a wallet still being made", async () => {
    const { hub, person } = setup({
      userIdFor: () => Promise.reject(new AppError("WALLET_NOT_READY")),
    });
    const peer = fakePeer();
    hub.open(peer);

    await hub.message(peer, json({ type: "auth", token: person().token }));

    expect(peer.received).toEqual([
      {
        v: 1,
        type: "error",
        code: "WALLET_NOT_READY",
        message: "Your wallet is still being set up. Try again in a moment.",
      },
    ]);
  });

  test("answers an unexpected failure with INTERNAL and logs it", async () => {
    const { hub, person, lines } = setup({
      userIdFor: () => Promise.reject(new Error("database down")),
    });
    const peer = fakePeer();
    hub.open(peer);

    await hub.message(peer, json({ type: "auth", token: person().token }));

    expect(errorCodes(peer)).toEqual(["INTERNAL"]);
    expect(lines).toContainEqual(
      expect.objectContaining({ level: "error", msg: "WebSocket message failed" }),
    );
  });

  test.each([
    ["text that isn't JSON", "hello"],
    ["an unknown message", json({ type: "ping" })],
    ["an unknown channel", json({ type: "subscribe", channel: "everyone" })],
    ["a binary message, passed on as empty text", ""],
  ])("answers %s with VALIDATION_FAILED", async (_, text) => {
    const { hub } = setup();
    const peer = fakePeer();
    hub.open(peer);

    await hub.message(peer, text);

    expect(errorCodes(peer)).toEqual(["VALIDATION_FAILED"]);
  });
});

describe("sendToUser", () => {
  test("reaches only that user's subscribed connections", async () => {
    const { hub, person, subscribed } = setup();
    const maya = person();
    const sam = person();
    const mayaPhone = await subscribed(maya.token);
    const mayaLaptop = await subscribed(maya.token);
    const samPeer = await subscribed(sam.token);
    const mayaNotSubscribed = fakePeer();
    hub.open(mayaNotSubscribed);
    await hub.message(mayaNotSubscribed, json({ type: "auth", token: maya.token }));

    expect(hub.sendToUser(maya.userId, BALANCE_CHANGED)).toBe(2);
    expect(mayaPhone.received.at(-1)).toEqual(BALANCE_CHANGED);
    expect(mayaLaptop.received.at(-1)).toEqual(BALANCE_CHANGED);
    expect(samPeer.received).not.toContainEqual(BALANCE_CHANGED);
    expect(mayaNotSubscribed.received).toEqual([]);
  });

  test("reaches nobody for a user with no connection", () => {
    const { hub } = setup();
    expect(hub.sendToUser("user-without-connections", BALANCE_CHANGED)).toBe(0);
  });

  test("follows a connection that signs in as someone else", async () => {
    const { hub, person, subscribed } = setup();
    const maya = person();
    const sam = person();
    const peer = await subscribed(maya.token);

    await hub.message(peer, json({ type: "auth", token: sam.token }));

    expect(hub.sendToUser(maya.userId, BALANCE_CHANGED)).toBe(0);
    expect(hub.sendToUser(sam.userId, BALANCE_CHANGED)).toBe(1);
  });

  test("a new token for the same user changes nothing", async () => {
    const { hub, person, subscribed } = setup();
    const maya = person();
    const peer = await subscribed(maya.token);

    await hub.message(peer, json({ type: "auth", token: maya.token }));

    expect(errorCodes(peer)).toEqual([]);
    expect(hub.sendToUser(maya.userId, BALANCE_CHANGED)).toBe(1);
  });

  test("forgets a connection once it closes, and ignores its late messages", async () => {
    const { hub, person, subscribed } = setup();
    const maya = person();
    const peer = await subscribed(maya.token);

    hub.close(peer);
    await hub.message(peer, json({ type: "subscribe", channel: "me" }));
    hub.close(peer);

    expect(hub.sendToUser(maya.userId, BALANCE_CHANGED)).toBe(0);
    expect(hub.size).toBe(0);
    expect(peer.received).toEqual([{ v: 1, type: "subscribed", channel: "me" }]);
  });
});

describe("closing while messages wait", () => {
  test("drops messages still waiting when the connection closes", async () => {
    const { hub, person } = setup();
    const peer = fakePeer();
    hub.open(peer);

    const waiting = hub.message(peer, json({ type: "auth", token: person().token }));
    hub.close(peer);
    await waiting;

    expect(peer.received).toEqual([]);
  });

  test("doesn't count a connection that closed while its auth was checked", async () => {
    const { hub, person, subscribed } = setup();
    const maya = person();
    for (let index = 0; index < WS_MAX_CONNECTIONS_PER_USER; index += 1) {
      const peer = fakePeer();
      hub.open(peer);
      // The token check is under way when the tab closes.
      const auth = hub.message(peer, json({ type: "auth", token: maya.token }));
      await Promise.resolve();
      hub.close(peer);
      await auth;
    }

    const fresh = await subscribed(maya.token);

    expect(errorCodes(fresh)).toEqual([]);
    expect(hub.sendToUser(maya.userId, BALANCE_CHANGED)).toBe(1);
  });
});

describe("limits", () => {
  test(`refuses connection ${WS_MAX_CONNECTIONS_PER_USER + 1} of one user, until one closes`, async () => {
    const { hub, person, subscribed } = setup();
    const maya = person();
    const open: FakePeer[] = [];
    for (let index = 0; index < WS_MAX_CONNECTIONS_PER_USER; index += 1) {
      open.push(await subscribed(maya.token));
    }

    const extra = await subscribed(maya.token);
    expect(errorCodes(extra)).toEqual(["TOO_MANY_CONNECTIONS", "UNAUTHORIZED"]);
    expect(extra.closedWith?.code).toBe(WS_CLOSE_CODES.TOO_MANY_CONNECTIONS);

    const [first] = open;
    if (first) hub.close(first);
    const replacement = await subscribed(maya.token);
    expect(errorCodes(replacement)).toEqual([]);
    expect(hub.sendToUser(maya.userId, BALANCE_CHANGED)).toBe(WS_MAX_CONNECTIONS_PER_USER);
  });

  test("closes a connection with neither auth nor a subscription after the window", async () => {
    const { hub, person } = setup({ authWindowMs: 20 });
    const idle = fakePeer();
    const signedIn = fakePeer();
    hub.open(idle);
    hub.open(signedIn);
    await hub.message(signedIn, json({ type: "auth", token: person().token }));

    await Bun.sleep(40);

    expect(idle.closedWith?.code).toBe(WS_CLOSE_CODES.IDLE);
    expect(signedIn.closedWith).toBeNull();
  });

  test("clears the window's timer when a connection closes early", async () => {
    const { hub } = setup({ authWindowMs: 20 });
    const peer = fakePeer();
    hub.open(peer);
    hub.close(peer);

    await Bun.sleep(40);

    expect(peer.closedWith).toBeNull();
  });
});

describe("heartbeat", () => {
  test("pings every connection, then drops the ones that didn't answer", () => {
    const { hub } = setup();
    const answers = fakePeer();
    const silent = fakePeer();
    hub.open(answers);
    hub.open(silent);

    hub.heartbeat();
    expect([answers.pings, silent.pings]).toEqual([1, 1]);

    hub.pong(answers);
    hub.heartbeat();

    expect(answers.pings).toBe(2);
    expect(answers.terminated).toBe(false);
    expect(silent.terminated).toBe(true);
  });

  test("ignores a pong from a connection it doesn't know", () => {
    const { hub } = setup();
    expect(() => hub.pong(fakePeer())).not.toThrow();
  });
});

describe("closeAll", () => {
  test("tells every connection the server is going away", () => {
    const { hub } = setup();
    const peers = [fakePeer(), fakePeer()];
    for (const peer of peers) hub.open(peer);

    hub.closeAll();

    expect(peers.map((peer) => peer.closedWith?.code)).toEqual([1001, 1001]);
  });
});
