import { describe, expect, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeApi } from "../../test/fake-api";
import { createFakeAuth, FAKE_TOKEN } from "../../test/fake-auth";
import { renderRoute } from "../../test/render-route";

const signedIn = () => createFakeAuth({ status: "signed-in" });

async function accountSection() {
  return within(await screen.findByRole("region", { name: "Account" }));
}

describe("the Account section", () => {
  test("shows who is signed in, read from the API with the access token", async () => {
    const { api } = await renderRoute("/settings", { auth: signedIn() });
    const account = await accountSection();

    expect((await account.findByText("calm_otter_42")).closest("p")?.textContent).toBe(
      "Signed in as calm_otter_42",
    );
    expect(api.requests[0]?.headers.get("authorization")).toBe(`Bearer ${FAKE_TOKEN}`);
  });

  test("waits while the new wallet is being set up", async () => {
    await renderRoute("/settings", {
      auth: signedIn(),
      api: createFakeApi({ walletNotReadyTimes: 1 }),
    });
    const account = await accountSection();

    expect((await account.findByRole("status")).textContent).toBe("Setting up your wallet…");
    expect(await account.findByText("calm_otter_42", {}, { timeout: 3000 })).toBeDefined();
  });

  test("offers Try again when the account can't load", async () => {
    await renderRoute("/settings", { auth: signedIn(), api: createFakeApi({ meFails: true }) });
    const account = await accountSection();

    expect(
      await account.findByText("We couldn't load your account. Try again.", {}, { timeout: 3000 }),
    ).toBeDefined();
    expect(account.getByRole("button", { name: "Try again" })).toBeDefined();
  });

  test("signs out and goes back to the landing page", async () => {
    const user = userEvent.setup();
    const { auth } = await renderRoute("/settings", { auth: signedIn() });
    const account = await accountSection();
    await account.findByText("calm_otter_42");
    await user.click(account.getByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "See what people are trading. Trade it yourself.",
      }),
    ).toBeDefined();
    expect(auth.calls.signOuts).toBe(1);
    expect(screen.getByRole("button", { name: "Create account" })).toBeDefined();
  });
});
