import { Button } from "../ui/button";

type ErrorStateProps = {
  // What happened and what to do, in plain words.
  message?: string;
  onRetry: () => void;
};

export function ErrorState({
  message = "Something went wrong on our side. Try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-start gap-4 py-6">
      <p className="text-ink-2">{message}</p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
