import { describe, expect, test } from "bun:test";
import { act, screen, within } from "@testing-library/react";
import { createFakeApi } from "../../test/fake-api";
import { createFakeAuth } from "../../test/fake-auth";
import { renderRoute } from "../../test/render-route";
import { BALANCE_POLL_MS, BALANCES_QUERY_KEY } from "./use-balances";

async function depositPage(api = createFakeApi()) {
  const rendered = await renderRoute("/deposit", {
    auth: createFakeAuth({ status: "signed-in" }),
    api,
  });
  await screen.findByText("Your balances");
  return rendered;
}

const balanceRows = () =>
  within(screen.getByText("Your balances").parentElement as HTMLElement)
    .getAllByRole("listitem")
    .map((row) => row.textContent);

describe("Add funds", () => {
  test("shows a QR code of the address, and where money can come from", async () => {
    await depositPage();
    expect(screen.getByRole("img", { name: "QR code of your Solana address" })).toBeDefined();
    expect(
      screen.getByText("Send from any Solana wallet or exchange, such as Backpack or Phantom."),
    ).toBeDefined();
  });

  test("shows the balances, formatted", async () => {
    await depositPage(createFakeApi({ balances: { usdc: 12_500_000n, sol: 20_000_000n } }));
    expect(balanceRows()).toEqual(["USDC12.5", "SOL0.02"]);
    expect(screen.getByText("Waiting for your deposit. This updates by itself.")).toBeDefined();
  });

  test("says what arrived once a balance goes up", async () => {
    const api = createFakeApi({ balances: { usdc: 1_000_000n } });
    const { queryClient } = await depositPage(api);

    api.setBalances({ usdc: 51_000_000n, sol: 20_000_000n });
    await act(() => queryClient.refetchQueries({ queryKey: BALANCES_QUERY_KEY }));

    expect(await screen.findByText("Received 50 USDC and 0.02 SOL.")).toBeDefined();
    expect(balanceRows()).toEqual(["USDC51", "SOL0.02"]);
  });

  test("checks again every 5 seconds while it's open", async () => {
    const { queryClient } = await depositPage();
    const query = queryClient.getQueryCache().find({ queryKey: BALANCES_QUERY_KEY });
    expect(query?.observers[0]?.options.refetchInterval).toBe(BALANCE_POLL_MS);
    expect(BALANCE_POLL_MS).toBe(5_000);
  });

  test("says so when the balances can't be read", async () => {
    await renderRoute("/deposit", {
      auth: createFakeAuth({ status: "signed-in" }),
      api: createFakeApi({ balancesFail: true }),
    });
    expect(
      await screen.findByText(
        "We couldn't check your balances. We'll keep trying.",
        {},
        { timeout: 3000 },
      ),
    ).toBeDefined();
  });
});
