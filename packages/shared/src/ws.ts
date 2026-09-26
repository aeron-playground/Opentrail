// The WebSocket protocol on /v1/ws. Like /v1, it's a public contract for the web app, the mobile
// app and outside developers: add message types, fields and channels freely, but never change or
// remove one that has shipped. Documented in developers/websocket-protocol.mdx.
// zod/mini keeps these rules small enough to ship to browsers.
import * as z from "zod/mini";

export const WS_PATH = "/v1/ws";

/** Every server message carries it as `v`, so a client can tell a newer format apart. */
export const WS_PROTOCOL_VERSION = 1;

/**
 * The first `auth` has to arrive this soon after connecting. A connection with neither auth nor
 * a subscription by then is closed, since it can receive nothing.
 */
export const WS_AUTH_WINDOW_MS = 10_000;

/** The server pings this often, and closes a connection that didn't answer the previous ping. */
export const WS_PING_INTERVAL_MS = 25_000;

export const WS_MAX_CONNECTIONS_PER_USER = 5;

/** The largest message a client may send, in bytes. An access token fits many times over. */
export const WS_MAX_MESSAGE_BYTES = 16 * 1024;

/**
 * Reconnecting: wait about 1 second, then double the wait after each failed try, up to 30
 * seconds. Each wait is randomized, so clients cut off together don't all come back together.
 */
export const WS_RECONNECT_MIN_MS = 1_000;
export const WS_RECONNECT_MAX_MS = 30_000;

/** Close codes the server uses besides the standard ones, such as 1001 when it restarts. */
export const WS_CLOSE_CODES = {
  /** Neither auth nor a subscription within the auth window. */
  IDLE: 4000,
  /** The user already has the most connections allowed. Wait the longest delay, then try again. */
  TOO_MANY_CONNECTIONS: 4029,
} as const;

/** `me`: events about the signed-in user, such as `balance.changed`. Needs auth. */
export const WS_CHANNELS = ["me"] as const;
export type WsChannel = (typeof WS_CHANNELS)[number];

const channel = z.enum(WS_CHANNELS);

// Sent by clients. Anything else is answered with a VALIDATION_FAILED error.
export const WsClientMessageSchema = z.discriminatedUnion("type", [
  // Send it again when the access token is refreshed.
  z.object({
    type: z.literal("auth"),
    token: z.string().check(z.minLength(1), z.maxLength(WS_MAX_MESSAGE_BYTES)),
  }),
  z.object({ type: z.literal("subscribe"), channel }),
]);
export type WsClientMessage = z.infer<typeof WsClientMessageSchema>;

// Sent by the server. Clients must ignore message types and fields they don't know yet.
const v = z.literal(WS_PROTOCOL_VERSION);
export const WsServerMessageSchema = z.discriminatedUnion("type", [
  z.looseObject({ v, type: z.literal("subscribed"), channel }),
  // No data: the client reads its balances again.
  z.looseObject({ v, type: z.literal("balance.changed") }),
  // One of the API's error codes. A string, not a list, so a new code never breaks a client.
  z.looseObject({ v, type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type WsServerMessage = z.infer<typeof WsServerMessageSchema>;

/** Reads a message from the server, or null for one this version doesn't understand. */
export function parseWsServerMessage(text: string): WsServerMessage | null {
  const parsed = WsServerMessageSchema.safeParse(parseJson(text));
  return parsed.success ? parsed.data : null;
}

/** Reads a message from a client, or null when it isn't one the protocol knows. */
export function parseWsClientMessage(text: string): WsClientMessage | null {
  const parsed = WsClientMessageSchema.safeParse(parseJson(text));
  return parsed.success ? parsed.data : null;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
