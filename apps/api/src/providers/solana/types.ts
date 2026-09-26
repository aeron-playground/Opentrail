// What the API reads from Solana. Everything else about the RPC stays behind this type.
export type SolanaReader = {
  /** Lamports the address holds: 1 SOL is 1,000,000,000 lamports. */
  getSolBalance(owner: string): Promise<bigint>;
  /** The raw amount of `mint` across all of the owner's token accounts; 0 when there are none. */
  getTokenBalance(owner: string, mint: string): Promise<bigint>;
};
