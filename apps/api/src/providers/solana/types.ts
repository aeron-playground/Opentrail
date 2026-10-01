// What the API reads from Solana. Everything else about the RPC stays behind this type.
import type { AddressesByLookupTableAddress, Blockhash } from "@solana/kit";

export type SolanaReader = {
  /** Lamports the address holds: 1 SOL is 1,000,000,000 lamports. */
  getSolBalance(owner: string): Promise<bigint>;
  /** The raw amount of `mint` across all of the owner's token accounts; 0 when there are none. */
  getTokenBalance(owner: string, mint: string): Promise<bigint>;
  /** The token account at `account`; null when there is none, or the address holds something else. */
  getTokenAccount(account: string): Promise<TokenAccount | null>;
  /** The newest blockhash, at 'confirmed', and the last block height a transaction using it can land in. */
  getLatestBlockhash(): Promise<BlockhashLifetime>;
  /** The addresses inside each lookup table, read from the chain. Throws when a table doesn't exist. */
  getLookupTables(tables: readonly string[]): Promise<AddressesByLookupTableAddress>;
  /** Runs an unsigned transaction without sending it, with a fresh blockhash and no signature check. */
  simulate(base64: string): Promise<Simulation>;
  /**
   * Priority fees that recent transactions writing to these accounts paid, in micro-lamports per
   * compute unit, one per recent slot. At most 128 accounts.
   */
  getRecentPriorityFees(accounts: readonly string[]): Promise<bigint[]>;
};

export type BlockhashLifetime = { blockhash: Blockhash; lastValidBlockHeight: bigint };

// What happened when a transaction ran without being sent.
export type Simulation = {
  // Solana's error as it sent it, with every number as a bigint, such as
  // { InstructionError: [3n, { Custom: 6001n }] }; null when the transaction would succeed.
  error: unknown;
  // Compute units the run used; null when the server didn't say.
  unitsConsumed: bigint | null;
  logs: string[];
};

export type TokenAccount = {
  mint: string;
  owner: string;
  // An issuer can freeze an account; a frozen one can't send or receive.
  frozen: boolean;
};
