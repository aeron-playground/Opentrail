// Bun's server options: the WebSocket at /v1/ws goes to the hub, everything else to the Hono app.
import { WS_MAX_MESSAGE_BYTES, WS_PATH } from "@repo/shared";
import type { Server } from "bun";
import type { App } from "./app";
import type { Hub } from "./ws/hub";

// A client that reads too slowly is dropped rather than buffered without end.
const BACKPRESSURE_LIMIT_BYTES = 1024 * 1024;
// A second safety net behind the hub's heartbeat: answering a ping counts as activity.
const IDLE_TIMEOUT_SECONDS = 60;

export function serveOptions({ app, hub, port }: { app: App; hub: Hub; port: number }) {
  return {
    port,
    fetch(request: Request, server: Server<undefined>) {
      // A plain HTTP request to /v1/ws isn't an upgrade, so it falls through to a 404.
      if (new URL(request.url).pathname === WS_PATH && server.upgrade(request)) {
        return undefined;
      }
      return app.fetch(request, server);
    },
    websocket: {
      maxPayloadLength: WS_MAX_MESSAGE_BYTES,
      backpressureLimit: BACKPRESSURE_LIMIT_BYTES,
      closeOnBackpressureLimit: true,
      idleTimeout: IDLE_TIMEOUT_SECONDS,
      // The hub sends its own pings, so it can tell which connections answered.
      sendPings: false,
      open: hub.open,
      // The protocol is JSON text; a binary message reads as nothing and gets an error back.
      message: (peer, message) => hub.message(peer, typeof message === "string" ? message : ""),
      pong: hub.pong,
      close: hub.close,
    } satisfies Bun.WebSocketHandler<undefined>,
  };
}
