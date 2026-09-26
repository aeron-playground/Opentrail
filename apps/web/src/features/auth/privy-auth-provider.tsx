import { Component, lazy, type ReactNode, Suspense, useCallback, useState } from "react";
import type { Auth } from "./auth";
import { AuthContext, placeholderAuth } from "./auth-context";

// Privy's SDK is large, so it arrives in its own file after the page has shown. Until then the
// app renders with the status "loading".
const PrivyBridge = lazy(() =>
  import("./privy-bridge").then((module) => ({ default: module.PrivyBridge })),
);

export function PrivyAuthProvider({
  appId,
  children,
}: {
  appId: string | null;
  children: ReactNode;
}) {
  const [auth, setAuth] = useState<Auth>(() =>
    placeholderAuth(appId === null ? "unavailable" : "loading"),
  );
  const markUnavailable = useCallback(() => setAuth(placeholderAuth("unavailable")), []);

  return (
    <AuthContext.Provider value={auth}>
      {children}
      {appId !== null && (
        <BridgeBoundary onError={markUnavailable}>
          <Suspense fallback={null}>
            <PrivyBridge appId={appId} onChange={setAuth} />
          </Suspense>
        </BridgeBoundary>
      )}
    </AuthContext.Provider>
  );
}

// If Privy's file can't load (offline) or Privy fails, the app keeps working without sign-in.
class BridgeBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    this.props.onError();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
