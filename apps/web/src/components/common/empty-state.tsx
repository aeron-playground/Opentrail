import type { ReactNode } from "react";

// One line that says what's missing, and at most one action that fixes it.
export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 py-6">
      <p className="text-ink-2">{message}</p>
      {action}
    </div>
  );
}
