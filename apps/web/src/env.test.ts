import { describe, expect, test } from "bun:test";
import { readWebEnv } from "./env";

describe("readWebEnv", () => {
  test("uses the local API and no sign-in when nothing is set", () => {
    expect(readWebEnv({})).toEqual({
      apiUrl: "http://localhost:3001",
      wsUrl: "ws://localhost:3001/v1/ws",
      privyAppId: null,
    });
  });

  test("reads both values, trimmed, without a trailing slash", () => {
    expect(
      readWebEnv({ VITE_API_URL: " https://api.example.com/ ", VITE_PRIVY_APP_ID: " app-id " }),
    ).toEqual({
      apiUrl: "https://api.example.com",
      wsUrl: "wss://api.example.com/v1/ws",
      privyAppId: "app-id",
    });
  });

  test("keeps a path in the API address for live updates too", () => {
    expect(readWebEnv({ VITE_API_URL: "https://example.com/api" }).wsUrl).toBe(
      "wss://example.com/api/v1/ws",
    );
  });

  test("uses a live updates address that is set", () => {
    expect(readWebEnv({ VITE_WS_URL: " wss://live.example.com/v1/ws " }).wsUrl).toBe(
      "wss://live.example.com/v1/ws",
    );
  });

  test.each(["https://live.example.com/v1/ws", "live.example.com"])(
    "refuses %s as the live updates address",
    (value) => {
      expect(() => readWebEnv({ VITE_WS_URL: value })).toThrow("VITE_WS_URL");
    },
  );

  test("treats an empty app id as not set", () => {
    expect(readWebEnv({ VITE_PRIVY_APP_ID: "  " }).privyAppId).toBeNull();
  });

  test.each(["api.example.com", "ftp://api.example.com", "not a url"])(
    "refuses %s as the API address",
    (value) => {
      expect(() => readWebEnv({ VITE_API_URL: value })).toThrow("VITE_API_URL");
    },
  );
});
