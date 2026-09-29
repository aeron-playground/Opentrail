// A Jupiter for tests: prices live in memory, and nothing touches the network.
import type { JupiterPrices, PriceQuote } from "./types";

export type FakeJupiter = JupiterPrices & {
  /** The prices the fake answers with; a mint missing here is left out, as Jupiter does. */
  prices: Map<string, PriceQuote>;
  /** The mints asked for, one list per call. */
  calls: string[][];
  /** Makes the next calls fail, as if Jupiter were down; null makes them work again. */
  failWith(error: Error | null): void;
};

export function createFakeJupiter(initial: Record<string, PriceQuote> = {}): FakeJupiter {
  const prices = new Map(Object.entries(initial));
  const calls: string[][] = [];
  let failure: Error | null = null;
  return {
    prices,
    calls,
    async getPrices(mints) {
      calls.push([...mints]);
      if (failure) {
        throw failure;
      }
      return new Map(
        mints.flatMap((mint) => {
          const quote = prices.get(mint);
          return quote ? [[mint, quote] as const] : [];
        }),
      );
    },
    failWith(error) {
      failure = error;
    },
  };
}
