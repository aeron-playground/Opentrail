// Why a token passes a safety check it fails on paper: it keeps a mint or freeze authority by
// design. Each note is written by a person and reviewed in a pull request; the safety job only
// reads them. Authorities checked on the chain on 2026-10-01.
export const SAFETY_NOTES: Readonly<Record<string, string>> = {
  // USDC: both authorities are ordinary keys.
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:
    "USDC is a stablecoin. Its issuer, Circle, keeps the keys to create tokens and to freeze " +
    "accounts: it creates USDC when dollars come in, and must be able to freeze funds when the " +
    "law requires it.",
  // JitoSOL: the mint authority is a program address, which no one holds a key for.
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn:
    "JitoSOL is a liquid staking token. New JitoSOL is created only by its stake pool program, " +
    "when someone stakes SOL; no person holds that key.",
  // mSOL: the mint authority is a program address, which no one holds a key for.
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So:
    "mSOL is a liquid staking token. New mSOL is created only by Marinade's staking program, " +
    "when someone stakes SOL; no person holds that key.",
};
