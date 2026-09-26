import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import type { Auth } from "./auth";
import { placeholderAuth, useAuth } from "./auth-context";

// The real bridge loads Privy, which needs the network. This stand-in either signs in at once
// or crashes, as Privy's file would when it can't load.
let bridge: "signs-in" | "crashes" = "signs-in";

function SignsIn({ onChange }: { onChange: (auth: Auth) => void }) {
  useEffect(() => {
    onChange({ ...placeholderAuth("loading"), status: "signed-in" });
  }, [onChange]);
  return null;
}

function Crashes(): null {
  throw new Error("Privy couldn't load");
}

mock.module("./privy-bridge", () => ({
  PrivyBridge: (props: { appId: string; onChange: (auth: Auth) => void }) =>
    bridge === "crashes" ? <Crashes /> : <SignsIn onChange={props.onChange} />,
}));

const { PrivyAuthProvider } = await import("./privy-auth-provider");

function Status() {
  return <p>{useAuth().status}</p>;
}

afterEach(() => {
  bridge = "signs-in";
});

describe("PrivyAuthProvider", () => {
  test("says sign-in is unavailable when there's no app id, and loads nothing", async () => {
    render(
      <PrivyAuthProvider appId={null}>
        <Status />
      </PrivyAuthProvider>,
    );
    expect(screen.getByText("unavailable")).toBeDefined();
  });

  test("starts as loading, then takes the bridge's state", async () => {
    render(
      <PrivyAuthProvider appId="test-app">
        <Status />
      </PrivyAuthProvider>,
    );
    expect(screen.getByText("loading")).toBeDefined();
    expect(await screen.findByText("signed-in")).toBeDefined();
  });

  test("keeps the app running without sign-in when Privy fails", async () => {
    bridge = "crashes";
    // React reports the caught error on the console; the test only needs the outcome.
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    render(
      <PrivyAuthProvider appId="test-app">
        <Status />
      </PrivyAuthProvider>,
    );
    expect(await screen.findByText("unavailable")).toBeDefined();
    quiet.mockRestore();
  });
});
