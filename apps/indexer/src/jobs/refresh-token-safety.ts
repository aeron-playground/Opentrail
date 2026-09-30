import type { Logger } from "@repo/server";
import { safetyLevel } from "../market/safety-level";
import type { JupiterTokens } from "../providers/jupiter/types";
import type { SolanaMints } from "../providers/solana/types";
import type { SafetyBook, SafetyCheck } from "../safety-book";
import type { Job } from "./scheduler";

// One Jupiter call and one chain call every 10 minutes keep market cap and 24-hour volume fresh,
// far inside both free limits.
export const SAFETY_EVERY_MS = 10 * 60_000;

export type RefreshTokenSafetyDeps = {
  safetyBook: SafetyBook;
  jupiter: JupiterTokens;
  solana: SolanaMints;
  logger: Logger;
  // Tests pass a fixed clock.
  now?: () => Date;
};

// Checks every token against Jupiter's token data and its mint on the chain, and saves its
// level and stats. A token either source skips keeps its last checks; a failed run is logged by
// the scheduler and tried again next time.
export function refreshTokenSafetyJob({
  safetyBook,
  jupiter,
  solana,
  logger,
  now = () => new Date(),
}: RefreshTokenSafetyDeps): Job {
  // Warn when the set of unchecked tokens changes, not every 10 minutes.
  let lastMissing = "";
  return {
    name: "refresh-token-safety",
    everyMs: SAFETY_EVERY_MS,
    run: async () => {
      const known = await safetyBook.tokens();
      if (known.length === 0) {
        return;
      }
      const mints = known.map((token) => token.mint);
      const [market, authorities] = await Promise.all([
        jupiter.getTokens(mints),
        solana.getAuthorities(mints),
      ]);

      const checks: SafetyCheck[] = [];
      const missing: string[] = [];
      for (const token of known) {
        const data = market.get(token.mint);
        const chain = authorities.get(token.mint);
        if (data === undefined || chain === undefined) {
          missing.push(token.symbol);
          continue;
        }
        const level = safetyLevel({
          isVerified: data.isVerified,
          liquidityUsd: data.liquidityUsd,
          ...chain,
          hasReviewedNote: token.hasReviewedNote,
        });
        if (token.safetyLevel !== null && token.safetyLevel !== level) {
          logger.warn(
            { symbol: token.symbol, from: token.safetyLevel, to: level },
            "a token's safety level changed",
          );
        }
        checks.push({
          mint: token.mint,
          isJupiterVerified: data.isVerified,
          ...chain,
          liquidityUsd: data.liquidityUsd,
          marketCapUsd: data.marketCapUsd,
          volume24hUsd: data.volume24hUsd,
          safetyLevel: level,
        });
      }

      if (missing.join(",") !== lastMissing) {
        lastMissing = missing.join(",");
        if (missing.length > 0) {
          logger.warn({ missing }, "no safety data for some tokens; they keep their last checks");
        }
      }
      await safetyBook.save(checks, now());
      logger.debug({ checked: checks.length }, "token safety refreshed");
    },
  };
}
