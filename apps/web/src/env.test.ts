import { describe, expect, test } from "bun:test";
import { readWebEnv } from "./env";

describe("readWebEnv", () => {
  test("uses the local API and no sign-in when nothing is set", () => {
    expect(readWebEnv({})).toEqual({ apiUrl: "http://localhost:3001", privyAppId: null });
  });

  test("reads both values, trimmed, without a trailing slash", () => {
    expect(
      readWebEnv({ VITE_API_URL: " https://api.example.com/ ", VITE_PRIVY_APP_ID: " app-id " }),
    ).toEqual({ apiUrl: "https://api.example.com", privyAppId: "app-id" });
  });

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
