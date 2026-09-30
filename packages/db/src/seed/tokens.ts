// The curated token list. Every entry is the output of `bun scripts/add-token.ts`, which checks it
// against Jupiter's token data and the mint's own account on Solana. Never type one by hand.
// To stop trading a token, move it to UNLISTED_TOKENS; never delete an entry.
import type { TokenProgram } from "@repo/solana";
import type { NewToken } from "../schema/tokens";
import { SAFETY_NOTES } from "./safety-notes";

export type SeedToken = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  tokenProgram: TokenProgram;
  logoUrl: string | null;
};

// Shown, never traded: USDC is what people pay with.
export const UNLISTED_TOKENS: readonly SeedToken[] = [
  {
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    tokenProgram: "spl-token",
    logoUrl:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
  },
];

// Tradable, in the order lists show them. Each had at least $1M of liquidity on Jupiter when it
// was added (2026-09-29).
export const LISTED_TOKENS: readonly SeedToken[] = [
  {
    mint: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    name: "Wrapped SOL",
    decimals: 9,
    tokenProgram: "spl-token",
    logoUrl:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  },
  {
    mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    symbol: "JUP",
    name: "Jupiter",
    decimals: 6,
    tokenProgram: "spl-token",
    logoUrl: "https://static.jup.ag/jup/icon.png",
  },
  {
    mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    symbol: "RAY",
    name: "Raydium",
    decimals: 6,
    tokenProgram: "spl-token",
    logoUrl:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png",
  },
  {
    mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
    symbol: "JitoSOL",
    name: "Jito Staked SOL",
    decimals: 9,
    tokenProgram: "spl-token",
    logoUrl: "https://storage.googleapis.com/token-metadata/JitoSOL-256.png",
  },
  {
    mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
    symbol: "mSOL",
    name: "Marinade staked SOL (mSOL)",
    decimals: 9,
    tokenProgram: "spl-token",
    logoUrl:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png",
  },
  {
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    symbol: "Bonk",
    name: "Bonk",
    decimals: 5,
    tokenProgram: "spl-token",
    logoUrl: "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I",
  },
  {
    mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    symbol: "$WIF",
    name: "dogwifhat",
    decimals: 6,
    tokenProgram: "spl-token",
    logoUrl:
      "https://bafkreibk3covs5ltyqxa272uodhculbr6kea6betidfwy3ajsav2vjzyum.ipfs.nftstorage.link",
  },
];

/** Rows for the tokens table: listed tokens ranked from 1 in list order, with their notes. */
export function seedTokenRows(): NewToken[] {
  const note = (mint: string) => SAFETY_NOTES[mint] ?? null;
  return [
    ...UNLISTED_TOKENS.map((token) => ({
      ...token,
      isListed: false,
      sortRank: null,
      safetyNote: note(token.mint),
    })),
    ...LISTED_TOKENS.map((token, index) => ({
      ...token,
      isListed: true,
      sortRank: index + 1,
      safetyNote: note(token.mint),
    })),
  ];
}
