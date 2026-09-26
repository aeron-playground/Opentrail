import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

// A text field at the 44 px tap size. Always pair it with a visible <label>.
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-control border border-line bg-paper px-3 text-body text-ink placeholder:text-ink-3 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
