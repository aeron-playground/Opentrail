// Tokens every part of the app knows by heart. Each mint was checked on mainnet: owned by the
// SPL Token program, with these decimals. Never add one without checking it the same way.

export type KnownToken = {
  readonly mint: string;
  readonly symbol: string;
  // Raw amounts are whole units of 10^-decimals: 1 USDC is 1,000,000 raw.
  readonly decimals: number;
};

export const USDC: KnownToken = {
  mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  symbol: "USDC",
  decimals: 6,
};

// Native SOL and wrapped SOL share the wSOL mint in our tables.
export const SOL: KnownToken = {
  mint: "So11111111111111111111111111111111111111112",
  symbol: "SOL",
  decimals: 9,
};

// The two programs that own token mints: the original SPL Token program and Token-2022. Each was
// checked on mainnet: an executable program run by the upgradeable loader. Our tables use the
// short names.
export const TOKEN_PROGRAM_NAMES = ["spl-token", "token-2022"] as const;

export type TokenProgram = (typeof TOKEN_PROGRAM_NAMES)[number];

// A Record over the names, so every name needs an address and no other key fits.
export const TOKEN_PROGRAMS: Readonly<Record<TokenProgram, string>> = {
  "spl-token": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "token-2022": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
};

/** The short name of the program at `address`, or null when it isn't a token program. */
export function tokenProgramAt(address: string): TokenProgram | null {
  return TOKEN_PROGRAM_NAMES.find((name) => TOKEN_PROGRAMS[name] === address) ?? null;
}
