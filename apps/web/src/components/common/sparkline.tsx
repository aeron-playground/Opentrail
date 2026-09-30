import { formatChangePercent } from "@repo/format";
import { compareDecimals, percentChange } from "@repo/pnl";
import { cn } from "../../lib/cn";

const WIDTH = 72;
const HEIGHT = 28;
const PADDING = 2;
const DECIMAL = /^\d+(?:\.\d+)?$/;

// A small line of prices, oldest first: green when the period went up, red when it went down.
// The prices become numbers only to place points on the drawing; the change is exact.
export function Sparkline({
  prices,
  label,
  className,
}: {
  prices: readonly string[];
  // What the line shows, such as "7-day trend", for screen readers.
  label: string;
  className?: string;
}) {
  const readable = prices.filter((price) => DECIMAL.test(price));
  const values = readable.map(Number);
  const first = readable[0];
  const last = readable.at(-1);
  if (readable.length < 2 || first === undefined || last === undefined) {
    return (
      <span className={cn("block h-7 w-18", className)}>
        <span className="sr-only">{`${label}: not enough prices yet`}</span>
      </span>
    );
  }
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const points = values
    .map((value, index) => {
      const x = PADDING + (index / (values.length - 1)) * (WIDTH - 2 * PADDING);
      const y = PADDING + (1 - (value - low) / span) * (HEIGHT - 2 * PADDING);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  // Read from the shown percent, so a change that rounds to 0.00% is unchanged, as in the rows.
  const percent = percentChange(first, last);
  const change = percent === null ? null : formatChangePercent(percent);
  const compared = compareDecimals(last, first);
  const direction = change?.direction ?? (compared > 0 ? "up" : compared < 0 ? "down" : "flat");
  const words =
    direction === "flat"
      ? `${label}: unchanged`
      : change === null
        ? `${label}: ${direction}`
        : `${label}: ${direction} ${change.text.replace(/^[+−]/, "")}`;
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label={words}
      className={cn(
        direction === "up" ? "text-gain" : direction === "down" ? "text-loss" : "text-ink-3",
        className,
      )}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
