// The web app's settings. Every VITE_ value ships to every browser, so none of them may be a
// secret. This is the only file that reads them.

export type WebEnv = {
  // Where the API answers, without a trailing slash.
  apiUrl: string;
  // Privy's public app id. Without it, the app runs and sign-in says it isn't set up.
  privyAppId: string | null;
};

type EnvSource = Record<string, unknown>;

const LOCAL_API_URL = "http://localhost:3001";

export function readWebEnv(source: EnvSource): WebEnv {
  const apiUrl = text(source.VITE_API_URL) || LOCAL_API_URL;
  if (!isWebAddress(apiUrl)) {
    throw new Error(
      "VITE_API_URL must be an http or https address, such as http://localhost:3001. " +
        "Check apps/web/.env.",
    );
  }
  return {
    apiUrl: apiUrl.replace(/\/+$/, ""),
    privyAppId: text(source.VITE_PRIVY_APP_ID) || null,
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isWebAddress(value: string): boolean {
  if (!URL.canParse(value)) {
    return false;
  }
  const { protocol } = new URL(value);
  return protocol === "https:" || protocol === "http:";
}

export const env = readWebEnv(import.meta.env);
