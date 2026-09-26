import type { ReactNode } from "react";
import { ErrorState } from "../../components/common/error-state";
import { Skeleton } from "../../components/ui/skeleton";
import { isWaitingForWallet, type Me, useMe } from "./use-me";

// Loads the signed-in person's account and shows the right state until it's there.
export function WithAccount({ children }: { children: (me: Me) => ReactNode }) {
  const me = useMe();
  if (me.isSuccess) {
    return children(me.data);
  }
  if (me.isError) {
    return (
      <ErrorState
        message="We couldn't load your account. Try again."
        onRetry={() => me.refetch()}
      />
    );
  }
  if (isWaitingForWallet(me)) {
    return (
      <p role="status" className="py-6 text-ink-2">
        Setting up your wallet…
      </p>
    );
  }
  return (
    <div role="status" className="flex flex-col gap-3 py-6">
      <span className="sr-only">Loading your account</span>
      <Skeleton className="h-6 w-56" />
      <Skeleton className="h-11" />
    </div>
  );
}
