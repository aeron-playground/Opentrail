import { describe, expect, test } from "bun:test";
import type { WsServerMessage } from "@repo/shared/ws";
import { act, screen, waitFor } from "@testing-library/react";
import { createFakeApi } from "../../test/fake-api";
import { createFakeAuth, FAKE_TOKEN } from "../../test/fake-auth";
import { fakeSockets } from "../../test/fake-socket";
import { renderRoute } from "../../test/render-route";

const send = (message: WsServerMessage) => JSON.stringify(message);
const BALANCE_CHANGED = send({ v: 1, type: "balance.changed" });
const SUBSCRIBED = send({ v: 1, type: "subscribed", channel: "me" });

const balanceReads = (api: ReturnType<typeof createFakeApi>) =>
  api.requests.filter((request) => new URL(request.url).pathname === "/v1/me/balances").length;

async function signedInOnAddFunds(api = createFakeApi()) {
  const sockets = fakeSockets();
  const rendered = await renderRoute("/deposit", {
    auth: createFakeAuth({ status: "signed-in" }),
    api,
    liveSocket: sockets.create,
  });
  await screen.findByText("Your balances");
  await waitFor(() => expect(sockets.all).toHaveLength(1));
  const socket = sockets.latest();
  await act(async () => socket.opened());
  await waitFor(() => expect(socket.sent).toHaveLength(2));
  return { ...rendered, sockets, socket };
}

describe("live updates", () => {
  test("signs in on the connection and subscribes to me", async () => {
    const { socket } = await signedInOnAddFunds();
    expect(socket.sent).toEqual([
      { type: "auth", token: FAKE_TOKEN },
      { type: "subscribe", channel: "me" },
    ]);
  });

  test("Add funds says what arrived as soon as balance.changed comes in", async () => {
    const api = createFakeApi({ balances: { usdc: 1_000_000n } });
    const { socket } = await signedInOnAddFunds(api);

    api.setBalances({ usdc: 51_000_000n });
    await act(async () => socket.receive(BALANCE_CHANGED));

    // Well before the next 5-second check.
    expect(await screen.findByText("Received 50 USDC.", {}, { timeout: 1000 })).toBeDefined();
  });

  test("reads balances again after coming back from a drop, not on the first subscribe", async () => {
    const api = createFakeApi();
    const { socket } = await signedInOnAddFunds(api);
    const before = balanceReads(api);

    await act(async () => socket.receive(SUBSCRIBED));
    expect(balanceReads(api)).toBe(before);

    await act(async () => socket.receive(SUBSCRIBED));
    await waitFor(() => expect(balanceReads(api)).toBe(before + 1));
  });

  test("connects only while signed in, and closes on sign-out", async () => {
    const sockets = fakeSockets();
    const auth = createFakeAuth({ status: "signed-out" });
    await renderRoute("/", { auth, liveSocket: sockets.create });
    await act(() => Bun.sleep(20));
    expect(sockets.all).toHaveLength(0);

    await act(async () => auth.setState({ status: "signed-in" }));
    await waitFor(() => expect(sockets.all).toHaveLength(1));

    await act(async () => auth.setState({ status: "signed-out" }));
    expect(sockets.latest().closedWith).toBe(1000);
  });
});
