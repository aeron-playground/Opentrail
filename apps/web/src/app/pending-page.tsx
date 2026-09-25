import { Skeleton } from "../components/ui/skeleton";

// Shown in place of a page whose data takes long enough to notice. Shaped like a page, a title
// and rows, so nothing jumps when the content arrives.
export function PendingPage() {
  return (
    <div role="status" className="mx-auto w-full max-w-feed px-4 py-8 lg:py-10">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-8 w-40" />
      <div className="mt-6 flex flex-col gap-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </div>
  );
}
