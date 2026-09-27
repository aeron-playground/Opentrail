import { afterAll, describe, expect, test } from "bun:test";
import { createLogger } from "@repo/server";
import { WS_MAX_MESSAGE_BYTES, WS_PATH } from "@repo/shared/ws";
import { createApp } from "./app";
import { createFakePrivy } from "./providers/privy/fake";
import { serveOptions } from "./server";
import { testAppDeps } from "./testing";
import { createHub } from "./ws/hub";

const USER_ID = "0192b6f0-7c1e-7a3b-9d7e-3f5c1a2b4d6e";

const privy = createFakePrivy();
const maya = privy.signIn();
const hub = createHub({ privy, userIdFor: async () => USER_ID, logger: createLogger("silent") });
const server = Bun.serve(serveOptions({ app: createApp(testAppDeps({ privy })), hub, port: 0 }));

afterAll(async () => {
  await server.stop(true);
});

// A real WebSocket client, like a browser's, with its messages in arrival order.
async function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}${WS_PATH}`);
  const inbox: unknown[] = [];
  let wake: (() => void) | null = null;
  socket.addEventListener("message", (event) => {
    inbox.push(JSON.parse(String(event.data)));
    wake?.();
  });
  const closed = new Promise<number>((resolve) => {
    socket.addEventListener("close", (event) => resolve(event.code));
  });
  await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
  const next = async () => {
    while (inbox.length === 0) {
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
    return inbox.shift();
  };
  return { socket, next, closed };
}

describe("/v1/ws", () => {
  test("signs in, subscribes and receives balance.changed", async () => {
    const { socket, next } = await connect();
    socket.send(JSON.stringify({ type: "auth", token: maya.token }));
    socket.send(JSON.stringify({ type: "subscribe", channel: "me" }));

    expect(await next()).toEqual({ v: 1, type: "subscribed", channel: "me" });
    expect(hub.sendToUser(USER_ID, { v: 1, type: "balance.changed" })).toBe(1);
    expect(await next()).toEqual({ v: 1, type: "balance.changed" });

    socket.close();
  });

  test("answers a binary message with VALIDATION_FAILED", async () => {
    const { socket, next } = await connect();
    socket.send(new Uint8Array([1, 2, 3]));
    expect(await next()).toMatchObject({ type: "error", code: "VALIDATION_FAILED" });
    socket.close();
  });

  test("closes a connection that sends a message over the size limit", async () => {
    const { socket, closed } = await connect();
    socket.send("x".repeat(WS_MAX_MESSAGE_BYTES + 1));
    // Bun drops it without a closing handshake (1006); 1009, "message too big", would do too.
    expect([1006, 1009]).toContain(await closed);
  });

  test("forgets closed connections", async () => {
    const { socket, closed } = await connect();
    socket.close();
    await closed;
    // The server hears about the close a moment after the client.
    for (let tries = 0; hub.size > 0 && tries < 50; tries += 1) {
      await Bun.sleep(10);
    }
    expect(hub.size).toBe(0);
  });
});

describe("plain HTTP", () => {
  test("a request to /v1/ws that isn't an upgrade gets the API's 404", async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}${WS_PATH}`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  test("every other route still reaches the app", async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/v1/health`);
    expect(response.status).toBe(200);
  });
});
