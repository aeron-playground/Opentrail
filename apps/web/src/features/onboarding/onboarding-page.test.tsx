import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeApi, FAKE_ME, NEW_ME } from "../../test/fake-api";
import { createFakeAuth } from "../../test/fake-auth";
import { renderRoute } from "../../test/render-route";

// A person who just signed in for the first time, starting anywhere in the app.
async function newAccount(path = "/", options: Parameters<typeof createFakeApi>[0] = {}) {
  const user = userEvent.setup();
  const rendered = await renderRoute(path, {
    auth: createFakeAuth({ status: "signed-in" }),
    api: createFakeApi({ me: NEW_ME, ...options }),
  });
  await screen.findByRole("heading", { level: 1, name: "Choose your username" });
  return { user, ...rendered };
}

const field = () => screen.getByLabelText("Username") as HTMLInputElement;

async function typeName(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.clear(field());
  await user.type(field(), name);
}

describe("onboarding", () => {
  test("opens for a new account, with the random name ready to keep", async () => {
    const { router } = await newAccount("/explore");

    expect(router.state.location.pathname).toBe("/onboarding");
    expect(field().value).toBe("calm_otter_42");
    expect(screen.getByText("This is your username.")).toBeDefined();
    expect(screen.getByText("You can change it once every 30 days.")).toBeDefined();
    expect(screen.getByText("Your username, trades and holdings are public.")).toBeDefined();
  });

  test("keeps the random name with Continue, then shows where to add funds", async () => {
    const { user, api } = await newAccount();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Add funds" })).toBeDefined();
    expect(screen.getByText(FAKE_ME.walletAddress)).toBeDefined();
    expect(screen.getByText("Send only on the Solana network.")).toBeDefined();
    expect(api.me()).toMatchObject({ username: "calm_otter_42", usernameChosen: true });
  });

  test("saves a new name", async () => {
    const { user, api } = await newAccount();
    await typeName(user, "Maya");
    expect(await screen.findByText("maya is available.")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Add funds" })).toBeDefined();
    expect(api.me().username).toBe("maya");
  });

  test("suggests another free name with Shuffle", async () => {
    const { user } = await newAccount();
    await user.click(screen.getByRole("button", { name: "Shuffle" }));

    await waitFor(() => expect(field().value).toBe("brave_heron_07"));
    expect(await screen.findByText("brave_heron_07 is available.")).toBeDefined();
  });

  test("says so when Shuffle fails", async () => {
    const { user } = await newAccount("/", { suggestFails: true });
    await user.click(screen.getByRole("button", { name: "Shuffle" }));

    expect(await screen.findByText("We couldn't suggest a name. Try again.")).toBeDefined();
  });

  test.each([
    ["maya", "That username is taken."],
    ["adm1n", "That username isn't available."],
    ["ab", "3–20 letters, numbers or _, starting with a letter."],
  ])("explains why %s can't be used, and won't continue", async (name, message) => {
    const { user } = await newAccount("/", { taken: ["maya"] });
    await typeName(user, name);

    const shown = await screen.findAllByText(message);
    expect(shown.length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", true);
  });

  test("Done leads to Portfolio, and the app stops sending you to onboarding", async () => {
    const { user, router } = await newAccount();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Done" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Portfolio" })).toBeDefined();
    await router.navigate({ to: "/explore" });
    expect(await screen.findByRole("heading", { level: 1, name: "Explore" })).toBeDefined();
    expect(router.state.location.pathname).toBe("/explore");
  });

  test("I'll do this later leads home", async () => {
    const { user } = await newAccount();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "I'll do this later" }));

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "See what people are trading. Trade it yourself.",
      }),
    ).toBeDefined();
  });

  test("leaves people who already chose a name alone", async () => {
    const { router } = await renderRoute("/explore", {
      auth: createFakeAuth({ status: "signed-in" }),
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Explore" })).toBeDefined();
    expect(router.state.location.pathname).toBe("/explore");
  });
});

describe("the address to add funds to", () => {
  const clipboard = () => spyOn(navigator.clipboard, "writeText");
  let spy: ReturnType<typeof clipboard> | undefined;

  afterEach(() => {
    spy?.mockRestore();
  });

  async function depositPage() {
    const user = userEvent.setup();
    await renderRoute("/deposit", { auth: createFakeAuth({ status: "signed-in" }) });
    await screen.findByText(FAKE_ME.walletAddress);
    return user;
  }

  test("is copied with one click", async () => {
    spy = clipboard().mockResolvedValue(undefined);
    const user = await depositPage();
    await user.click(screen.getByRole("button", { name: "Copy address" }));

    expect(spy).toHaveBeenCalledWith(FAKE_ME.walletAddress);
    expect(await screen.findByText("Copied.")).toBeDefined();
  });

  test("tells the person to copy it by hand when the browser refuses", async () => {
    spy = clipboard().mockRejectedValue(new Error("denied"));
    const user = await depositPage();
    await user.click(screen.getByRole("button", { name: "Copy address" }));

    expect(
      await screen.findByText("Couldn't copy. Select the address and copy it yourself."),
    ).toBeDefined();
  });
});
