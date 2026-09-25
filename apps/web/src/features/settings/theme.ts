// The theme choice, saved in this browser. public/theme.js reads the same key and applies the
// same rule before the first paint; theme.test.ts keeps the two in step.
export const THEME_CHOICES = ["system", "light", "dark"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

const STORAGE_KEY = "theme";

function isThemeChoice(value: unknown): value is ThemeChoice {
  return THEME_CHOICES.some((choice) => choice === value);
}

export function readThemeChoice(): ThemeChoice {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isThemeChoice(saved) ? saved : "system";
  } catch {
    // Storage can be blocked (strict privacy settings): the page follows the system then.
    return "system";
  }
}

export function chooseTheme(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Blocked storage: the choice still applies until the page reloads.
  }
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = choice === "dark" || (choice === "system" && systemDark);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
