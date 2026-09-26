import { describe, expect, test } from "bun:test";
import { canSaveUsername, USERNAME_RULES, usernameSaveError } from "./username-field";
import type { UsernameState } from "./username-queries";

describe("usernameSaveError", () => {
  test.each([
    ["USERNAME_TAKEN", "That username is taken."],
    ["USERNAME_RESERVED", "That username isn't available."],
    ["VALIDATION_FAILED", USERNAME_RULES],
    ["USERNAME_CHANGE_TOO_SOON", "You can change your username once every 30 days."],
    ["INTERNAL", "We couldn't save your username. Try again."],
    [undefined, "We couldn't save your username. Try again."],
  ])("explains %s", (code, message) => {
    expect(usernameSaveError(code)).toBe(message);
  });
});

describe("canSaveUsername", () => {
  const states: [UsernameState, boolean][] = [
    ["same", true],
    ["available", true],
    ["checking", false],
    ["taken", false],
    ["reserved", false],
    ["invalid", false],
    ["error", false],
  ];
  test.each(states)("%s → %p", (state, expected) => {
    expect(canSaveUsername({ state, username: "maya" })).toBe(expected);
  });
});
