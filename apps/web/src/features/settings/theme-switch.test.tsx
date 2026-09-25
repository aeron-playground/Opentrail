import { afterEach, beforeEach, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeSwitch } from "./theme-switch";

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  // A light system, so only the user's choice can make the page dark.
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

function checkedLabels() {
  return screen
    .getAllByRole("radio", { checked: true })
    .map((radio) => radio.closest("label")?.textContent);
}

test("starts on System when nothing is saved", () => {
  render(<ThemeSwitch />);
  expect(screen.getByRole("group", { name: "Theme" })).toBeDefined();
  expect(checkedLabels()).toEqual(["System"]);
});

test("shows the saved choice", () => {
  window.localStorage.setItem("theme", "dark");
  render(<ThemeSwitch />);
  expect(checkedLabels()).toEqual(["Dark"]);
});

test("picking Dark saves it and switches the page at once", async () => {
  const user = userEvent.setup();
  render(<ThemeSwitch />);

  await user.click(screen.getByRole("radio", { name: "Dark" }));

  expect(checkedLabels()).toEqual(["Dark"]);
  expect(window.localStorage.getItem("theme")).toBe("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
});

test("works from the keyboard", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem("theme", "dark");
  render(<ThemeSwitch />);

  // Tab reaches the checked option; the arrow keys move the choice.
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Dark" }));
  await user.keyboard("{ArrowUp}");

  expect(checkedLabels()).toEqual(["Light"]);
  expect(window.localStorage.getItem("theme")).toBe("light");
  expect(document.documentElement.dataset.theme).toBe("light");
});
