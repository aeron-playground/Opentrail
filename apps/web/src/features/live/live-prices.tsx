import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type LivePrices = {
  wanted: boolean;
  // Counts one more screen that shows prices; returns the function that counts it out.
  want: () => () => void;
};

const LivePricesContext = createContext<LivePrices | null>(null);

// Screens that show prices ask for live ones, and the live connection subscribes to them while at
// least one of those screens is on screen. Signed out, that's when a connection opens at all.
export function LivePricesProvider({ children }: { children: ReactNode }) {
  const [screens, setScreens] = useState(0);
  const want = useCallback(() => {
    setScreens((count) => count + 1);
    return () => setScreens((count) => count - 1);
  }, []);
  const value = useMemo(() => ({ wanted: screens > 0, want }), [screens, want]);
  return <LivePricesContext.Provider value={value}>{children}</LivePricesContext.Provider>;
}

/** Keeps live prices coming while the calling component is on screen. */
export function useLivePrices(): void {
  const want = useContext(LivePricesContext)?.want;
  useEffect(() => want?.(), [want]);
}

/** Whether any screen on display wants live prices. */
export function useLivePricesWanted(): boolean {
  return useContext(LivePricesContext)?.wanted ?? false;
}
