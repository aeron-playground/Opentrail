import { describe, expect, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeAuth, FAKE_CODE } from "../../test/fake-auth";
import { renderRoute } from "../../test/render-route";

const GUARDED = [
  { path: "/portfolio", message: "Sign in to see your holdings and results." },
  { path: "/alerts", message: "Sign in to see trades from people you follow." },
  { path: "/deposit", message: "Sign in to see where to send your funds." },
  { path: "/settings", message: "Sign in to change your settings." },
];

describe("pages that need sign-in", () => {
  for (const { path, message } of GUARDED) {
    test(`${path} asks visitors to sign in`, async () => {
      await renderRoute(path);
      const main = await screen.findByRole("main");
      expect(within(main).getByText(message)).toBeDefined();
      expect(within(main).getByRole("button", { name: "Sign in" })).toBeDefined();
    });
  }

  test("shows the page once the visitor signs in", async () => {
    const user = userEvent.setup();
    await renderRoute("/portfolio");
    const main = await screen.findByRole("main");
    await user.click(within(main).getByRole("button", { name: "Sign in" }));

    const dialog = await screen.findByRole("dialog", { name: "Sign in or create an account" });
    await user.type(within(dialog).getByLabelText("Email"), "maya@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Send code" }));
    await user.type(await within(dialog).findByLabelText("Code"), FAKE_CODE);
    await user.click(within(dialog).getByRole("button", { name: "Sign in" }));

    expect(
      await within(main).findByText("Your holdings, cash and results will show here."),
    ).toBeDefined();
  });

  test("shows a loading screen while sign-in loads", async () => {
    await renderRoute("/portfolio", { auth: createFakeAuth({ status: "loading" }) });
    const main = await screen.findByRole("main");
    expect(within(main).getByRole("status").textContent).toBe("Loading");
  });

  test("explains when sign-in isn't available, with no button", async () => {
    await renderRoute("/portfolio", { auth: createFakeAuth({ status: "unavailable" }) });
    const main = await screen.findByRole("main");
    expect(
      within(main).getByText("Sign-in isn't available right now. Reload the page to try again."),
    ).toBeDefined();
    expect(within(main).queryByRole("button", { name: "Sign in" })).toBeNull();
  });
});
