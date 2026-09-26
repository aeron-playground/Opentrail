// One live connection to the API's /v1/ws: it signs in, subscribes to `me`, and reconnects by
// itself after a drop, waiting a little longer each time.
import {
  parseWsServerMessage,
  WS_CLOSE_CODES,
  WS_RECONNECT_MAX_MS,
  WS_RECONNECT_MIN_MS,
  type WsClientMessage,
  type WsServerMessage,
} from "@repo/shared/ws";

export type LiveConnectionOptions = {
  url: string;
  /** A fresh access token, or null when nobody is signed in. */
  getToken: () => Promise<string | null>;
  onMessage: (message: WsServerMessage) => void;
  // Tests pass fakes for these.
  createSocket?: (url: string) => WebSocket;
  random?: () => number;
};

export type LiveConnection = { stop(): void };

// 1000: the standard "closing normally".
const NORMAL_CLOSE = 1000;

/**
 * The wait before try number `failures + 1`: it doubles from the shortest to the longest wait,
 * and is randomly between half and all of that, so clients cut off together come back apart.
 */
export function reconnectDelay(failures: number, random: () => number = Math.random): number {
  const ceiling = Math.min(WS_RECONNECT_MAX_MS, WS_RECONNECT_MIN_MS * 2 ** failures);
  return ceiling / 2 + (random() * ceiling) / 2;
}

export function startLiveConnection({
  url,
  getToken,
  onMessage,
  createSocket = (address) => new WebSocket(address),
  random = Math.random,
}: LiveConnectionOptions): LiveConnection {
  let stopped = false;
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  // Failed tries since the last successful subscribe.
  let failures = 0;

  function connect() {
    const current = createSocket(url);
    socket = current;
    const send = (message: WsClientMessage) => current.send(JSON.stringify(message));

    current.addEventListener("open", async () => {
      const token = await getToken().catch(() => null);
      // Stopped, or replaced, while the token was on its way.
      if (stopped || socket !== current) {
        return;
      }
      if (token === null) {
        current.close(NORMAL_CLOSE);
        return;
      }
      send({ type: "auth", token });
      send({ type: "subscribe", channel: "me" });
    });

    current.addEventListener("message", (event) => {
      if (socket !== current || typeof event.data !== "string") {
        return;
      }
      const message = parseWsServerMessage(event.data);
      if (message === null) {
        return;
      }
      if (message.type === "subscribed") {
        failures = 0;
      }
      onMessage(message);
    });

    current.addEventListener("close", (event) => {
      if (stopped || socket !== current) {
        return;
      }
      socket = null;
      const wait =
        event.code === WS_CLOSE_CODES.TOO_MANY_CONNECTIONS
          ? WS_RECONNECT_MAX_MS
          : reconnectDelay(failures, random);
      failures += 1;
      retry = setTimeout(connect, wait);
    });
  }

  connect();
  return {
    stop() {
      stopped = true;
      clearTimeout(retry);
      socket?.close(NORMAL_CLOSE);
      socket = null;
    },
  };
}
