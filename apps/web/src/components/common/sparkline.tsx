import { cn } from "../../lib/cn";

const WIDTH = 72;
const HEIGHT = 28;
const PADDING = 2;

// A small line of prices, oldest first: green when the period went up, red when it went down.
// The prices become numbers only to place points on the drawing, never for money math.
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
  const values = prices.map(Number).filter(Number.isFinite);
  const first = values[0];
  const last = values.at(-1);
  if (values.length < 2 || first === undefined || last === undefined) {
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
  const change = first === 0 ? 0 : ((last - first) / first) * 100;
  const direction = last > first ? "up" : last < first ? "down" : "flat";
  const words =
    direction === "flat"
      ? `${label}: unchanged`
      : `${label}: ${direction} ${Math.abs(change).toFixed(1)}%`;
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
