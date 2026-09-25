import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { chooseTheme, readThemeChoice, THEME_CHOICES } from "./theme";

// The real script from public/: it applies the saved choice on the next page load.
const themeScript = await Bun.file(join(import.meta.dir, "../../../public/theme.js")).text();
const originalMatchMedia = window.matchMedia;
const originalStorage = Object.getOwnPropertyDescriptor(window, "localStorage");

// A function, so TypeScript doesn't narrow the value to undefined after a delete.
const theme = () => document.documentElement.dataset.theme;

function setSystemDark(dark: boolean) {
  window.matchMedia = (() => ({
    matches: dark,
    addEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

// Browsers that block storage throw as soon as the page touches window.localStorage.
function blockStorage() {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get: () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    },
  });
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  if (originalStorage) {
    Object.defineProperty(window, "localStorage", originalStorage);
  } else {
    Reflect.deleteProperty(window, "localStorage");
  }
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("chooseTheme", () => {
  const cases = [
    { choice: "system", systemDark: false, expected: "light" },
    { choice: "system", systemDark: true, expected: "dark" },
    { choice: "light", systemDark: true, expected: "light" },
    { choice: "dark", systemDark: false, expected: "dark" },
  ] as const;

  for (const { choice, systemDark, expected } of cases) {
    test(`${choice} on a ${systemDark ? "dark" : "light"} system → ${expected}, at once`, () => {
      setSystemDark(systemDark);
      chooseTheme(choice);
      expect(theme()).toBe(expected);
    });
  }

  // The page must not flash another theme on the next load: public/theme.js has to read the
  // same key and reach the same result.
  for (const choice of THEME_CHOICES) {
    for (const systemDark of [false, true]) {
      test(`${choice} on a ${systemDark ? "dark" : "light"} system looks the same after a reload`, () => {
        setSystemDark(systemDark);
        chooseTheme(choice);
        const shown = theme();

        delete document.documentElement.dataset.theme;
        new Function(themeScript)();

        expect(theme()).toBe(shown);
      });
    }
  }

  test("still switches the page when storage is blocked", () => {
    setSystemDark(false);
    blockStorage();
    chooseTheme("dark");
    expect(theme()).toBe("dark");
  });
});

describe("readThemeChoice", () => {
  test("reads the saved choice", () => {
    window.localStorage.setItem("theme", "light");
    expect(readThemeChoice()).toBe("light");
  });

  test("falls back to system when nothing is saved", () => {
    expect(readThemeChoice()).toBe("system");
  });

  test("falls back to system for an unknown value", () => {
    window.localStorage.setItem("theme", "blue");
    expect(readThemeChoice()).toBe("system");
  });

  test("falls back to system when storage is blocked", () => {
    blockStorage();
    expect(readThemeChoice()).toBe("system");
  });
});
