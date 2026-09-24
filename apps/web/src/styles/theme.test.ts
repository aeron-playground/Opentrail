import { describe, expect, test } from "bun:test";
import { join } from "node:path";

// Reads the real theme.css, so a changed color can never skip this check.
const css = await Bun.file(join(import.meta.dir, "theme.css")).text();

type Palette = Record<string, string>;

function block(selector: string): Palette {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`theme.css has no "${selector}" block`);
  }
  const body = css.slice(start, css.indexOf("}", start));
  const palette: Palette = {};
  for (const [, name, hex] of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)) {
    if (name && hex) {
      palette[name] = hex;
    }
  }
  return palette;
}

const light = block(":root");
const dark = { ...light, ...block(':root[data-theme="dark"]') };
const palettes: Record<string, Palette> = {
  light,
  dark,
  "light colorblind": { ...light, ...block(':root[data-pnl="colorblind"]') },
  "dark colorblind": { ...dark, ...block(':root[data-theme="dark"][data-pnl="colorblind"]') },
};

// WCAG 2.2 relative luminance and contrast ratio.
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

// Every pair of text and background the design uses. --ink-3 is left out on purpose: it is
// only for placeholders and meta nobody must read.
const TEXT_PAIRS: [text: string, background: string][] = [
  ["ink", "paper"],
  ["ink", "paper-2"],
  ["ink-2", "paper"],
  ["ink-2", "paper-2"],
  ["gain", "paper"],
  ["gain", "paper-2"],
  ["loss", "paper"],
  ["loss", "paper-2"],
  ["caution", "caution-bg"],
  // Button labels: primary, Buy and Sell.
  ["paper", "ink"],
  ["paper", "gain"],
  ["paper", "loss"],
];

const WCAG_AA = 4.5;

describe("theme.css contrast (WCAG AA, 4.5:1)", () => {
  for (const [name, palette] of Object.entries(palettes)) {
    for (const [text, background] of TEXT_PAIRS) {
      test(`${name}: ${text} on ${background}`, () => {
        const fg = palette[text];
        const bg = palette[background];
        expect(fg).toBeDefined();
        expect(bg).toBeDefined();
        expect(contrast(fg ?? "", bg ?? "")).toBeGreaterThanOrEqual(WCAG_AA);
      });
    }
  }
});

test("dark mode defines every color that light mode defines", () => {
  expect(Object.keys(block(':root[data-theme="dark"]')).sort()).toEqual(Object.keys(light).sort());
});
