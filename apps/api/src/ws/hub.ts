// The live connections on /v1/ws: who is signed in on each, what each subscribed to, and the
// heartbeat. It knows nothing about Bun, so tests drive it with fake connections.
import { AppError, type Logger } from "@repo/server";
import { ERRORS, type ErrorCode } from "@repo/shared";
import {
  parseWsClientMessage,
  WS_AUTH_WINDOW_MS,
  WS_CLOSE_CODES,
  WS_MAX_CONNECTIONS_PER_USER,
  WS_PROTOCOL_VERSION,
  type WsChannel,
  type WsServerMessage,
} from "@repo/shared/ws";
import type { PrivyProvider } from "../providers/privy/types";

/** One connection, as the hub needs it. Bun's ServerWebSocket fits this shape. */
export type Peer = {
  send(text: string): unknown;
  close(code?: number, reason?: string): void;
  /** Drops the connection at once, without the closing handshake. */
  terminate(): void;
  ping(): unknown;
};

export type HubDeps = {
  privy: Pick<PrivyProvider, "verifyAccessToken">;
  /** The account id for a signed-in Privy user: the same lookup as GET /v1/me. */
  userIdFor(privyDid: string): Promise<string>;
  logger: Logger;
  authWindowMs?: number;
};

export type Hub = {
  open(peer: Peer): void;
  /** Resolves once this message and every earlier one from the peer are handled. */
  message(peer: Peer, text: string): Promise<void>;
  pong(peer: Peer): void;
  close(peer: Peer): void;
  /** Sends to the user's connections that subscribed to `me`. Returns how many got it. */
  sendToUser(userId: string, message: WsServerMessage): number;
  /** Closes connections that missed the last ping, and pings the rest. */
  heartbeat(): void;
  /** Closes every connection, as when the server restarts. */
  closeAll(): void;
  readonly size: number;
};

type Connection = {
  userId: string | null;
  channels: Set<WsChannel>;
  // False from a ping until its pong.
  alive: boolean;
  // Messages from one peer are handled one after another, so a subscribe sent right after auth
  // waits for the auth to finish.
  queue: Promise<void>;
  authTimer: ReturnType<typeof setTimeout>;
};

// 1001: the standard "going away", which tells clients to reconnect.
const GOING_AWAY = 1001;

export function createHub({
  privy,
  userIdFor,
  logger,
  authWindowMs = WS_AUTH_WINDOW_MS,
}: HubDeps): Hub {
  const connections = new Map<Peer, Connection>();
  const peersByUser = new Map<string, Set<Peer>>();

  const send = (peer: Peer, message: WsServerMessage) => {
    peer.send(JSON.stringify(message));
  };
  const sendError = (peer: Peer, code: ErrorCode) => {
    send(peer, { v: WS_PROTOCOL_VERSION, type: "error", code, message: ERRORS[code].message });
  };

  function setUser(peer: Peer, connection: Connection, userId: string | null) {
    if (connection.userId !== null) {
      const peers = peersByUser.get(connection.userId);
      peers?.delete(peer);
      if (peers?.size === 0) {
        peersByUser.delete(connection.userId);
      }
    }
    connection.userId = userId;
    if (userId !== null) {
      const peers = peersByUser.get(userId) ?? new Set();
      peers.add(peer);
      peersByUser.set(userId, peers);
    }
  }

  async function authenticate(peer: Peer, connection: Connection, token: string) {
    const privyDid = await privy.verifyAccessToken(token);
    if (privyDid === null) {
      sendError(peer, "UNAUTHORIZED");
      return;
    }
    let userId: string;
    try {
      userId = await userIdFor(privyDid);
    } catch (error) {
      if (error instanceof AppError) {
        sendError(peer, error.code);
        return;
      }
      throw error;
    }
    // It may have closed while the token was checked; counting it would lock the user out.
    if (connections.get(peer) !== connection) {
      return;
    }
    if (userId === connection.userId) {
      return;
    }
    if ((peersByUser.get(userId)?.size ?? 0) >= WS_MAX_CONNECTIONS_PER_USER) {
      sendError(peer, "TOO_MANY_CONNECTIONS");
      peer.close(WS_CLOSE_CODES.TOO_MANY_CONNECTIONS, "Too many connections");
      return;
    }
    setUser(peer, connection, userId);
  }

  async function handle(peer: Peer, text: string) {
    const connection = connections.get(peer);
    if (!connection) {
      return;
    }
    const message = parseWsClientMessage(text);
    if (message === null) {
      sendError(peer, "VALIDATION_FAILED");
      return;
    }
    if (message.type === "auth") {
      await authenticate(peer, connection, message.token);
      return;
    }
    // `me` is the only channel so far, and it needs a signed-in connection.
    if (connection.userId === null) {
      sendError(peer, "UNAUTHORIZED");
      return;
    }
    connection.channels.add(message.channel);
    send(peer, { v: WS_PROTOCOL_VERSION, type: "subscribed", channel: message.channel });
  }

  return {
    open(peer) {
      const connection: Connection = {
        userId: null,
        channels: new Set(),
        alive: true,
        queue: Promise.resolve(),
        authTimer: setTimeout(() => {
          if (connection.userId === null && connection.channels.size === 0) {
            peer.close(WS_CLOSE_CODES.IDLE, "No auth or subscription in time");
          }
        }, authWindowMs),
      };
      connections.set(peer, connection);
    },

    message(peer, text) {
      const connection = connections.get(peer);
      if (!connection) {
        return Promise.resolve();
      }
      connection.queue = connection.queue
        .then(() => handle(peer, text))
        .catch((error: unknown) => {
          logger.error({ err: error }, "WebSocket message failed");
          sendError(peer, "INTERNAL");
        });
      return connection.queue;
    },

    pong(peer) {
      const connection = connections.get(peer);
      if (connection) {
        connection.alive = true;
      }
    },

    close(peer) {
      const connection = connections.get(peer);
      if (!connection) {
        return;
      }
      clearTimeout(connection.authTimer);
      setUser(peer, connection, null);
      connections.delete(peer);
    },

    sendToUser(userId, message) {
      let sent = 0;
      for (const peer of peersByUser.get(userId) ?? []) {
        if (connections.get(peer)?.channels.has("me")) {
          send(peer, message);
          sent += 1;
        }
      }
      return sent;
    },

    heartbeat() {
      for (const [peer, connection] of connections) {
        if (!connection.alive) {
          // It never answered the last ping: the network is gone, so don't wait for a goodbye.
          peer.terminate();
          continue;
        }
        connection.alive = false;
        peer.ping();
      }
    },

    closeAll() {
      for (const peer of connections.keys()) {
        peer.close(GOING_AWAY, "Server restarting");
      }
    },

    get size() {
      return connections.size;
    },
  };
}
