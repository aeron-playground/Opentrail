import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

// The live region stays in the page, so screen readers announce the message when it appears.
export function OfflineBanner() {
  const online = useOnline();
  return (
    <div role="status">
      {online ? null : (
        <p className="border-b border-line bg-paper-2 px-4 py-2 text-center text-ink text-meta">
          You're offline. What you see may be out of date.
        </p>
      )}
    </div>
  );
}
