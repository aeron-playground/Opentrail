import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The token names from theme.css. tailwind-merge needs them: without them it would treat
// text-title (a size) and text-ink-2 (a color) as the same kind of class and drop one.
// A test keeps this list in step with theme.css.
export const TOKEN_NAMES = {
  color: [
    "paper",
    "paper-2",
    "line",
    "ink",
    "ink-2",
    "ink-3",
    "gain",
    "loss",
    "caution",
    "caution-bg",
    "scrim",
    "qr-ink",
    "qr-paper",
  ],
  text: ["hero", "hero-lg", "title", "section", "row", "body", "meta", "fine"],
  font: ["sans", "condensed", "mono"],
  radius: ["control", "sheet"],
  shadow: ["float"],
  container: ["feed", "panel"],
};

const twMerge = extendTailwindMerge({ extend: { theme: TOKEN_NAMES } });

// Joins class names and lets later classes win over earlier ones of the same kind.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
