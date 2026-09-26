import { describe, expect, test } from "bun:test";
import {
  parseWsClientMessage,
  parseWsServerMessage,
  WS_CLOSE_CODES,
  WS_MAX_MESSAGE_BYTES,
  WS_RECONNECT_MAX_MS,
  WS_RECONNECT_MIN_MS,
} from "./ws";

const json = (value: unknown) => JSON.stringify(value);

describe("parseWsClientMessage", () => {
  const accepted: [string, unknown][] = [
    ["auth", { type: "auth", token: "a-token" }],
    ["a subscribe to me", { type: "subscribe", channel: "me" }],
  ];
  test.each(accepted)("reads %s", (_, message) => {
    expect<unknown>(parseWsClientMessage(json(message))).toEqual(message);
  });

  test("drops fields it doesn't know", () => {
    expect(parseWsClientMessage(json({ type: "subscribe", channel: "me", extra: 1 }))).toEqual({
      type: "subscribe",
      channel: "me",
    });
  });

  const refused: [string, string][] = [
    ["text that isn't JSON", "hello"],
    ["JSON that isn't an object", json(["auth"])],
    ["an unknown type", json({ type: "ping" })],
    ["an unknown channel", json({ type: "subscribe", channel: "everyone" })],
    ["auth without a token", json({ type: "auth" })],
    ["auth with an empty token", json({ type: "auth", token: "" })],
    [
      "auth with a token over the size limit",
      json({ type: "auth", token: "x".repeat(WS_MAX_MESSAGE_BYTES + 1) }),
    ],
  ];
  test.each(refused)("refuses %s", (_, text) => {
    expect(parseWsClientMessage(text)).toBeNull();
  });
});

describe("parseWsServerMessage", () => {
  const accepted: [string, unknown][] = [
    ["subscribed", { v: 1, type: "subscribed", channel: "me" }],
    ["balance.changed", { v: 1, type: "balance.changed" }],
    ["error", { v: 1, type: "error", code: "UNAUTHORIZED", message: "Sign in again to continue." }],
  ];
  test.each(accepted)("reads %s", (_, message) => {
    expect<unknown>(parseWsServerMessage(json(message))).toEqual(message);
  });

  test("keeps fields added later, so older clients still read the message", () => {
    expect<unknown>(
      parseWsServerMessage(json({ v: 1, type: "balance.changed", mint: "x" })),
    ).toEqual({ v: 1, type: "balance.changed", mint: "x" });
  });

  test("accepts an error code it doesn't know yet", () => {
    expect(
      parseWsServerMessage(json({ v: 1, type: "error", code: "SOMETHING_NEW", message: "New." })),
    ).toMatchObject({ code: "SOMETHING_NEW" });
  });

  const ignored: [string, string][] = [
    ["text that isn't JSON", "{"],
    ["a type added later", json({ v: 1, type: "price", items: [] })],
    ["another protocol version", json({ v: 2, type: "balance.changed" })],
    ["a message without a version", json({ type: "balance.changed" })],
  ];
  test.each(ignored)("ignores %s", (_, text) => {
    expect(parseWsServerMessage(text)).toBeNull();
  });
});

describe("constants", () => {
  test("close codes are in the range kept for applications", () => {
    for (const code of Object.values(WS_CLOSE_CODES)) {
      expect(code).toBeGreaterThanOrEqual(4000);
      expect(code).toBeLessThanOrEqual(4999);
    }
  });

  test("the reconnect wait grows from the shortest to the longest", () => {
    expect(WS_RECONNECT_MIN_MS).toBeLessThan(WS_RECONNECT_MAX_MS);
  });
});
