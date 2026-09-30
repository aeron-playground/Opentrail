import type { Icon } from "@phosphor-icons/react";
import { SealCheckIcon } from "@phosphor-icons/react/SealCheck";
import { WarningIcon } from "@phosphor-icons/react/Warning";
import { WarningOctagonIcon } from "@phosphor-icons/react/WarningOctagon";
import { cn } from "../../lib/cn";

const BADGES: Record<"ok" | "caution" | "high_risk", { label: string; icon: Icon; tone: string }> =
  {
    ok: { label: "Verified", icon: SealCheckIcon, tone: "bg-paper-2 text-ink-2" },
    caution: { label: "Caution", icon: WarningIcon, tone: "bg-caution-bg text-caution" },
    high_risk: {
      label: "High risk",
      icon: WarningOctagonIcon,
      tone: "bg-caution-bg font-semibold text-caution",
    },
  };

// A token's safety level, beside its name. Red is for losses, so risk uses the caution color. A
// level this app doesn't know yet counts as caution; before the first check there's no badge.
export function SafetyBadge({ level, className }: { level: string | null; className?: string }) {
  if (level === null) {
    return null;
  }
  const badge = level === "ok" || level === "high_risk" ? BADGES[level] : BADGES.caution;
  const BadgeIcon = badge.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-meta",
        badge.tone,
        className,
      )}
    >
      <BadgeIcon size={16} weight="bold" aria-hidden="true" />
      <span className="sr-only">Safety: </span>
      {badge.label}
    </span>
  );
}
