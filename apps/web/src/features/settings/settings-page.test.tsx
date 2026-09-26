import { describe, expect, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeApi, FAKE_ME } from "../../test/fake-api";
import { createFakeAuth, FAKE_TOKEN } from "../../test/fake-auth";
import { renderRoute } from "../../test/render-route";

const signedIn = (options: Parameters<typeof createFakeAuth>[0] = {}) =>
  createFakeAuth({ status: "signed-in", ...options });

async function accountSection() {
  return within(await screen.findByRole("region", { name: "Account" }));
}

describe("the Account section", () => {
  test("shows the username, read from the API with the access token", async () => {
    const { api } = await renderRoute("/settings", { auth: signedIn() });
    const account = await accountSection();

    expect(await account.findByText("calm_otter_42")).toBeDefined();
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

  test("changes the username, then shows when it can change again", async () => {
    const user = userEvent.setup();
    const { api } = await renderRoute("/settings", { auth: signedIn() });
    const account = await accountSection();
    await user.click(await account.findByRole("button", { name: "Change" }));

    const field = account.getByLabelText("Username") as HTMLInputElement;
    expect(field.value).toBe("calm_otter_42");
    await user.clear(field);
    await user.type(field, "Maya");
    expect(await account.findByText("maya is available.")).toBeDefined();
    await user.click(account.getByRole("button", { name: "Save" }));

    expect(await account.findByText("Your username is now maya.")).toBeDefined();
    expect(account.getByText("maya")).toBeDefined();
    expect(account.getByText(/^You can change it again on /)).toBeDefined();
    expect(account.queryByRole("button", { name: "Change" })).toBeNull();
    expect(api.me().username).toBe("maya");
  });

  test("won't save a name someone else has", async () => {
    const user = userEvent.setup();
    await renderRoute("/settings", {
      auth: signedIn(),
      api: createFakeApi({ taken: ["maya"] }),
    });
    const account = await accountSection();
    await user.click(await account.findByRole("button", { name: "Change" }));
    const field = account.getByLabelText("Username");
    await user.clear(field);
    await user.type(field, "maya");

    expect(await account.findByText("That username is taken.")).toBeDefined();
    expect(account.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
  });

  test("goes back to the name with Cancel", async () => {
    const user = userEvent.setup();
    await renderRoute("/settings", { auth: signedIn() });
    const account = await accountSection();
    await user.click(await account.findByRole("button", { name: "Change" }));
    await user.click(account.getByRole("button", { name: "Cancel" }));

    expect(account.queryByLabelText("Username")).toBeNull();
    expect(account.getByRole("button", { name: "Change" })).toBeDefined();
  });

  test("shows the wait instead of Change while the name is locked", async () => {
    await renderRoute("/settings", {
      auth: signedIn(),
      api: createFakeApi({ me: { ...FAKE_ME, usernameChangeableAt: "2099-01-01T10:00:00.000Z" } }),
    });
    const account = await accountSection();

    expect(await account.findByText(/^You can change it again on .*2099/)).toBeDefined();
    expect(account.queryByRole("button", { name: "Change" })).toBeNull();
  });

  test("opens the export window for the person's wallet", async () => {
    const user = userEvent.setup();
    const { auth } = await renderRoute("/settings", { auth: signedIn() });
    const account = await accountSection();
    await user.click(await account.findByRole("button", { name: "Export wallet" }));

    expect(auth.calls.exports).toEqual([FAKE_ME.walletAddress]);
    expect(account.queryByRole("alert")).toBeNull();
  });

  test("says so when the export window can't open", async () => {
    const user = userEvent.setup();
    await renderRoute("/settings", { auth: signedIn({ exportFails: true }) });
    const account = await accountSection();
    await user.click(await account.findByRole("button", { name: "Export wallet" }));

    expect((await account.findByRole("alert")).textContent).toBe(
      "We couldn't open the export window. Try again.",
    );
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
