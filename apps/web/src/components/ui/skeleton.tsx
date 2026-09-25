import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

// A still placeholder shaped like the content that is loading. No pulsing: motion is only for
// answers to what the user does. The loading region itself says "Loading" to screen readers.
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div aria-hidden="true" className={cn("rounded-control bg-paper-2", className)} {...props} />
  );
}
