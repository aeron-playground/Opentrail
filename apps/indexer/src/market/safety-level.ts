// How safe a token is to trade. Pure: no network, no database.
import type { SafetyLevel } from "@repo/db";
import { compareDecimals } from "@repo/pnl";

// Dollars in a token's pools: below the first it's high risk, below the second it needs caution.
const HIGH_RISK_UNDER_USD = "100000";
const CAUTION_UNDER_USD = "1000000";

export type SafetyChecks = {
  // Jupiter's own review of the token.
  isVerified: boolean;
  // Null when Jupiter has no figure.
  liquidityUsd: string | null;
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  // A person reviewed why the token keeps an authority, such as a stablecoin's issuer.
  hasReviewedNote: boolean;
};

/**
 * - `high_risk`: Jupiter hasn't verified the token, or its pools hold under $100K.
 * - `caution`: its pools hold under $1M, or no one knows how much, or it keeps a mint or freeze
 *   authority without a reviewed note. A note excuses an authority, never thin liquidity.
 * - `ok`: every check passes.
 */
export function safetyLevel(checks: SafetyChecks): SafetyLevel {
  const liquidity = checks.liquidityUsd;
  if (
    !checks.isVerified ||
    (liquidity !== null && compareDecimals(liquidity, HIGH_RISK_UNDER_USD) < 0)
  ) {
    return "high_risk";
  }
  const authoritiesPass =
    (checks.mintAuthorityRevoked && checks.freezeAuthorityRevoked) || checks.hasReviewedNote;
  if (liquidity === null || compareDecimals(liquidity, CAUTION_UNDER_USD) < 0 || !authoritiesPass) {
    return "caution";
  }
  return "ok";
}
