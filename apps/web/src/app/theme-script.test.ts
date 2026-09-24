import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";

// The real file from public/, run the way the browser runs it: as a plain script.
const script = await Bun.file(join(import.meta.dir, "../../public/theme.js")).text();
const originalMatchMedia = window.matchMedia;
// Saved so the blocked-storage test can put the real storage back afterwards.
const originalStorage = Object.getOwnPropertyDescriptor(window, "localStorage");

function runThemeScript(options: {
  saved?: string;
  systemDark: boolean;
  storageBlocked?: boolean;
}) {
  const listeners: (() => void)[] = [];
  const media = {
    matches: options.systemDark,
    addEventListener: (_event: string, listener: () => void) => {
      listeners.push(listener);
    },
  };
  window.matchMedia = (() => media) as unknown as typeof window.matchMedia;
  window.localStorage.clear();
  if (options.saved !== undefined) {
    window.localStorage.setItem("theme", options.saved);
  }
  if (options.storageBlocked) {
    // Browsers that block storage throw as soon as the page touches window.localStorage.
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
  }
  delete document.documentElement.dataset.theme;

  new Function(script)();

  return {
    theme: () => document.documentElement.dataset.theme,
    systemChangesTo: (dark: boolean) => {
      media.matches = dark;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  if (originalStorage) {
    Object.defineProperty(window, "localStorage", originalStorage);
  } else {
    Reflect.deleteProperty(window, "localStorage");
  }
  window.localStorage.clear();
});

describe("public/theme.js", () => {
  const cases: { name: string; saved?: string; systemDark: boolean; expected: string }[] = [
    { name: "nothing saved, light system", systemDark: false, expected: "light" },
    { name: "nothing saved, dark system", systemDark: true, expected: "dark" },
    { name: "system saved, dark system", saved: "system", systemDark: true, expected: "dark" },
    { name: "light saved, dark system", saved: "light", systemDark: true, expected: "light" },
    { name: "dark saved, light system", saved: "dark", systemDark: false, expected: "dark" },
    { name: "an unknown value saved", saved: "blue", systemDark: true, expected: "dark" },
  ];

  for (const { name, saved, systemDark, expected } of cases) {
    test(`${name} → ${expected}`, () => {
      expect(runThemeScript({ saved, systemDark }).theme()).toBe(expected);
    });
  }

  test("follows the system when storage is blocked", () => {
    const page = runThemeScript({ saved: "light", systemDark: true, storageBlocked: true });
    expect(page.theme()).toBe("dark");
  });

  test("keeps following the system while the page is open", () => {
    const page = runThemeScript({ systemDark: false });
    page.systemChangesTo(true);
    expect(page.theme()).toBe("dark");
  });

  test("ignores system changes when the user picked a theme", () => {
    const page = runThemeScript({ saved: "light", systemDark: false });
    page.systemChangesTo(true);
    expect(page.theme()).toBe("light");
  });
});
