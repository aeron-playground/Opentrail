import { useState } from "react";
import { cn } from "../../lib/cn";

// A token's round logo, or the first letter of its symbol when there's no logo or it won't load.
// Logos come from their own hosts, so no referrer is sent: those hosts needn't see which page
// asked for them.
export function TokenIcon({
  symbol,
  logoUrl,
  className,
}: {
  symbol: string;
  logoUrl: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const letter =
    symbol
      .replace(/[^\p{L}\p{N}]/gu, "")
      .charAt(0)
      .toUpperCase() || "?";
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-paper-2 font-semibold text-ink-2 text-meta",
        className,
      )}
      aria-hidden="true"
    >
      {logoUrl !== null && !failed ? (
        <img
          src={logoUrl}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        letter
      )}
    </span>
  );
}
