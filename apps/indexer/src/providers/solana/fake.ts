// A Solana server for tests: authorities live in memory, and nothing touches the network.
import type { MintAuthorities, SolanaMints } from "./types";

export type FakeSolanaMints = SolanaMints & {
  /** The authorities the fake answers with; a mint missing here is left out. */
  authorities: Map<string, MintAuthorities>;
  /** The mints asked for, one list per call. */
  calls: string[][];
  /** Makes the next calls fail, as if the server were down; null makes them work again. */
  failWith(error: Error | null): void;
};

export function createFakeSolanaMints(
  initial: Record<string, MintAuthorities> = {},
): FakeSolanaMints {
  const authorities = new Map(Object.entries(initial));
  const calls: string[][] = [];
  let failure: Error | null = null;
  return {
    authorities,
    calls,
    async getAuthorities(mints) {
      calls.push([...mints]);
      if (failure) {
        throw failure;
      }
      return new Map(
        mints.flatMap((mint) => {
          const found = authorities.get(mint);
          return found ? [[mint, found] as const] : [];
        }),
      );
    },
    failWith(error) {
      failure = error;
    },
  };
}
