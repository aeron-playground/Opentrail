import { ArrowDownIcon } from "@phosphor-icons/react/ArrowDown";
import { ArrowUpIcon } from "@phosphor-icons/react/ArrowUp";
import { formatChangePercent } from "@repo/format";
import { cn } from "../../lib/cn";

// A price change in percent, with its sign and an arrow, never color alone. Green and red
// follow the gain and loss colors, including the colorblind setting.
export function PriceChange({
  percent,
  className,
}: {
  percent: string | null;
  className?: string;
}) {
  if (percent === null) {
    return (
      <span className={cn("text-ink-3 tabular-nums", className)}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">No 24-hour change yet</span>
      </span>
    );
  }
  const { text, direction } = formatChangePercent(percent);
  const Arrow = direction === "up" ? ArrowUpIcon : direction === "down" ? ArrowDownIcon : null;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-1 tabular-nums",
        direction === "up" ? "text-gain" : direction === "down" ? "text-loss" : "text-ink-2",
        className,
      )}
    >
      {Arrow && <Arrow size={14} weight="bold" aria-hidden="true" />}
      {text}
    </span>
  );
}
