// A Solana for tests: balances live in memory, and nothing touches the network.
import type { SolanaReader, TokenAccount } from "./types";

export type FakeSolana = SolanaReader & {
  setSol(owner: string, lamports: bigint): void;
  setToken(owner: string, mint: string, raw: bigint): void;
  setTokenAccount(account: string, details: TokenAccount): void;
  /** How many reads reached "Solana". */
  readonly reads: number;
  /** Makes the next reads fail, as if the RPC server were down. */
  fail(error: Error | null): void;
};

export function createFakeSolana(): FakeSolana {
  const sol = new Map<string, bigint>();
  const tokens = new Map<string, bigint>();
  const tokenAccounts = new Map<string, TokenAccount>();
  let reads = 0;
  let failure: Error | null = null;

  const read = <T>(value: T): Promise<T> => {
    reads += 1;
    return failure ? Promise.reject(failure) : Promise.resolve(value);
  };

  return {
    getSolBalance: (owner) => read(sol.get(owner) ?? 0n),
    getTokenBalance: (owner, mint) => read(tokens.get(`${owner}:${mint}`) ?? 0n),
    getTokenAccount: (account) => read(tokenAccounts.get(account) ?? null),
    setSol: (owner, lamports) => {
      sol.set(owner, lamports);
    },
    setToken: (owner, mint, raw) => {
      tokens.set(`${owner}:${mint}`, raw);
    },
    setTokenAccount: (account, details) => {
      tokenAccounts.set(account, details);
    },
    get reads() {
      return reads;
    },
    fail: (error) => {
      failure = error;
    },
  };
}
