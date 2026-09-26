// The web app's settings. Every VITE_ value ships to every browser, so none of them may be a
// secret. This is the only file that reads them.
import { WS_PATH } from "@repo/shared";

export type WebEnv = {
  // Where the API answers, without a trailing slash.
  apiUrl: string;
  // The API's live updates. By default the API's address with ws:// or wss:// and /v1/ws.
  wsUrl: string;
  // Privy's public app id. Without it, the app runs and sign-in says it isn't set up.
  privyAppId: string | null;
};

type EnvSource = Record<string, unknown>;

const LOCAL_API_URL = "http://localhost:3001";

export function readWebEnv(source: EnvSource): WebEnv {
  const apiUrl = text(source.VITE_API_URL) || LOCAL_API_URL;
  if (!hasProtocol(apiUrl, ["http:", "https:"])) {
    throw new Error(
      "VITE_API_URL must be an http or https address, such as http://localhost:3001. " +
        "Check apps/web/.env.",
    );
  }
  const api = apiUrl.replace(/\/+$/, "");
  const wsUrl = text(source.VITE_WS_URL) || `${api.replace(/^http/, "ws")}${WS_PATH}`;
  if (!hasProtocol(wsUrl, ["ws:", "wss:"])) {
    throw new Error(
      "VITE_WS_URL must be a ws or wss address, such as ws://localhost:3001/v1/ws. " +
        "Check apps/web/.env.",
    );
  }
  return { apiUrl: api, wsUrl, privyAppId: text(source.VITE_PRIVY_APP_ID) || null };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasProtocol(value: string, protocols: string[]): boolean {
  return URL.canParse(value) && protocols.includes(new URL(value).protocol);
}

export const env = readWebEnv(import.meta.env);
