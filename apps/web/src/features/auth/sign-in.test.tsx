import { describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeAuth, FAKE_CODE, type FakeAuth } from "../../test/fake-auth";
import { renderRoute } from "../../test/render-route";

async function openFromLanding(auth: FakeAuth = createFakeAuth()) {
  const user = userEvent.setup();
  await renderRoute("/", { auth });
  await user.click(await screen.findByRole("button", { name: "Create account" }));
  const dialog = await screen.findByRole("dialog", { name: "Sign in or create an account" });
  return { user, auth, dialog };
}

async function sendCode(email = "maya@example.com") {
  const opened = await openFromLanding();
  await opened.user.type(within(opened.dialog).getByLabelText("Email"), email);
  await opened.user.click(within(opened.dialog).getByRole("button", { name: "Send code" }));
  await within(opened.dialog).findByRole("heading", { name: "Check your email" });
  return opened;
}

describe("the sign-in sheet", () => {
  test("opens from Create account on the landing page", async () => {
    const { dialog } = await openFromLanding();
    expect(within(dialog).getByRole("button", { name: "Continue with Google" })).toBeDefined();
    expect(within(dialog).getByRole("button", { name: "Continue with GitHub" })).toBeDefined();
  });

  test("signs in with the code sent by email", async () => {
    const { user, auth, dialog } = await sendCode(" maya@example.com ");

    expect(auth.calls.emails).toEqual(["maya@example.com"]);
    expect(within(dialog).getByText("maya@example.com")).toBeDefined();
    await user.type(within(dialog).getByLabelText("Code"), FAKE_CODE);
    await user.click(within(dialog).getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(within(dialog).queryByRole("heading")).toBeNull());
    expect(auth.calls.codes).toEqual([FAKE_CODE]);
    // Signed in, the landing page stops offering to create an account.
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
  });

  test("keeps only digits in the code, and waits for all six", async () => {
    const { user, dialog } = await sendCode();
    const input = within(dialog).getByLabelText("Code") as HTMLInputElement;
    await user.type(input, "12a3");

    expect(input.value).toBe("123");
    expect(within(dialog).getByRole("button", { name: "Sign in" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  test("says so when the code is wrong, and stays open", async () => {
    const { user, dialog } = await sendCode();
    await user.type(within(dialog).getByLabelText("Code"), "000000");
    await user.click(within(dialog).getByRole("button", { name: "Sign in" }));

    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "That code didn't work. Check it, or send a new code.",
    );
    expect(within(dialog).getByRole("heading", { name: "Check your email" })).toBeDefined();
  });

  test("sends a new code on request", async () => {
    const { user, auth, dialog } = await sendCode();
    await user.click(within(dialog).getByRole("button", { name: "Send a new code" }));

    expect((await within(dialog).findByRole("status")).textContent).toBe("We sent a new code.");
    expect(auth.calls.emails).toHaveLength(2);
  });

  test("goes back to change the email", async () => {
    const { user, dialog } = await sendCode();
    await user.click(within(dialog).getByRole("button", { name: "Use another email" }));
    expect(
      within(dialog).getByRole("heading", { name: "Sign in or create an account" }),
    ).toBeDefined();
  });

  test("says so when no code could be sent", async () => {
    const { user, dialog } = await openFromLanding(createFakeAuth({ sendCodeFails: true }));
    await user.type(within(dialog).getByLabelText("Email"), "maya@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Send code" }));

    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "We couldn't send a code to that address. Check it and try again.",
    );
  });

  test("hands Google sign-in to the provider", async () => {
    const { user, auth, dialog } = await openFromLanding();
    await user.click(within(dialog).getByRole("button", { name: "Continue with Google" }));

    expect(auth.calls.oauth).toEqual(["google"]);
    expect(within(dialog).getByRole("button", { name: "Opening Google…" })).toBeDefined();
  });

  test("says so when GitHub can't be opened", async () => {
    const { user, dialog } = await openFromLanding(createFakeAuth({ oauthFails: true }));
    await user.click(within(dialog).getByRole("button", { name: "Continue with GitHub" }));

    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "We couldn't open GitHub. Try again.",
    );
  });

  test("opens by itself after coming back from Google without a sign-in", async () => {
    await renderRoute("/", { auth: createFakeAuth({ oauthFailed: true }) });
    const dialog = await screen.findByRole("dialog", { name: "Sign in or create an account" });
    expect(within(dialog).getByRole("alert").textContent).toBe(
      "We couldn't finish signing you in. Try again.",
    );
  });

  test("waits while sign-in is still loading", async () => {
    const { auth, dialog } = await openFromLanding();
    auth.setState({ status: "loading" });

    expect(within(dialog).getByRole("status").textContent).toBe("Getting sign-in ready…");
    expect(within(dialog).getByRole("button", { name: "Send code" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  test("explains when sign-in isn't available", async () => {
    const { dialog } = await openFromLanding(createFakeAuth({ status: "unavailable" }));
    expect(
      within(dialog).getByText("Sign-in isn't available right now. Reload the page to try again."),
    ).toBeDefined();
    expect(within(dialog).queryByLabelText("Email")).toBeNull();
  });

  test("closes with the Close button, and starts over when opened again", async () => {
    const { user, dialog } = await sendCode();
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(within(dialog).queryByRole("heading")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(
      await within(dialog).findByRole("heading", { name: "Sign in or create an account" }),
    ).toBeDefined();
  });
});

describe("the rail", () => {
  test("offers Sign in to visitors only", async () => {
    const user = userEvent.setup();
    const { auth } = await renderRoute("/explore");
    const rail = screen.getAllByRole("navigation", { name: "Main" })[0];
    if (!rail) throw new Error("no navigation");

    await user.click(within(rail).getByRole("button", { name: "Sign in" }));
    expect(
      await screen.findByRole("dialog", { name: "Sign in or create an account" }),
    ).toBeDefined();

    auth.setState({ status: "signed-in" });
    expect(within(rail).queryByRole("button", { name: "Sign in" })).toBeNull();
  });
});
