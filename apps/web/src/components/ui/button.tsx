import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

// Links that look like buttons use buttonVariants() with the router's Link.
export const buttonVariants = cva(
  // min-h-11 is 44px, the smallest tap target. Hover changes the background only, at once.
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 font-medium text-body disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-ink text-paper hover:bg-ink/90",
        secondary: "border border-line bg-paper text-ink hover:bg-paper-2",
        ghost: "text-ink hover:bg-paper-2",
        // Color means money: green and red only for Buy and Sell.
        buy: "bg-gain text-paper hover:bg-gain/90",
        sell: "bg-loss text-paper hover:bg-loss/90",
      },
      size: {
        default: "",
        icon: "size-11 px-0",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
