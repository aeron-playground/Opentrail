// One live connection to the API's /v1/ws: it signs in when it has a token, subscribes to the
// channels it's asked for, and reconnects by itself after a drop, waiting a little longer each
// time.
import {
  parseWsServerMessage,
  WS_CLOSE_CODES,
  WS_RECONNECT_MAX_MS,
  WS_RECONNECT_MIN_MS,
  WS_SIGNED_IN_CHANNELS,
  type WsChannel,
  type WsClientMessage,
  type WsServerMessage,
} from "@repo/shared/ws";

export type LiveConnectionOptions = {
  url: string;
  /** A fresh access token, or null when nobody is signed in. */
  getToken: () => Promise<string | null>;
  /** The channels to subscribe to. Without a token, only the public ones are. */
  channels: readonly WsChannel[];
  onMessage: (message: WsServerMessage) => void;
  // Tests pass fakes for these.
  createSocket?: (url: string) => WebSocket;
  random?: () => number;
};

export type LiveConnection = {
  /** Adds a channel: at once when connected, and again after every reconnect. */
  subscribe(channel: WsChannel): void;
  stop(): void;
};

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
  channels,
  onMessage,
  createSocket = (address) => new WebSocket(address),
  random = Math.random,
}: LiveConnectionOptions): LiveConnection {
  const wanted = new Set(channels);
  let stopped = false;
  let socket: WebSocket | null = null;
  // Whether the current socket signed in, once it's ready to subscribe; null while it isn't.
  let signedIn: boolean | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  // Failed tries since the last successful subscribe.
  let failures = 0;

  function connect() {
    const current = createSocket(url);
    socket = current;
    signedIn = null;
    const send = (message: WsClientMessage) => current.send(JSON.stringify(message));

    current.addEventListener("open", async () => {
      const token = await getToken().catch(() => null);
      // Stopped, or replaced, while the token was on its way.
      if (stopped || socket !== current) {
        return;
      }
      const open = [...wanted].filter((channel) => token !== null || isPublic(channel));
      if (open.length === 0) {
        current.close(NORMAL_CLOSE);
        return;
      }
      if (token !== null) {
        send({ type: "auth", token });
      }
      signedIn = token !== null;
      for (const channel of open) {
        send({ type: "subscribe", channel });
      }
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
      if (message.type === "auth.expired") {
        // The sign-in lasts as long as the token: sign in again with a fresh one.
        void getToken()
          .catch(() => null)
          .then((token) => {
            if (token !== null && !stopped && socket === current) {
              send({ type: "auth", token });
            }
          });
      }
      onMessage(message);
    });

    current.addEventListener("close", (event) => {
      if (stopped || socket !== current) {
        return;
      }
      socket = null;
      signedIn = null;
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
    subscribe(channel) {
      if (wanted.has(channel)) {
        return;
      }
      wanted.add(channel);
      // Before the socket is ready, the open handler subscribes to everything wanted.
      if (socket !== null && signedIn !== null && (signedIn || isPublic(channel))) {
        socket.send(JSON.stringify({ type: "subscribe", channel } satisfies WsClientMessage));
      }
    },
    stop() {
      stopped = true;
      clearTimeout(retry);
      socket?.close(NORMAL_CLOSE);
      socket = null;
    },
  };
}

const isPublic = (channel: WsChannel) => !WS_SIGNED_IN_CHANNELS.includes(channel);
