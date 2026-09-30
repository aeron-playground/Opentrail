import { type Database, type SafetyLevel, tokens } from "@repo/db";
import { asc, eq, sql } from "drizzle-orm";

export type TokenToCheck = {
  mint: string;
  symbol: string;
  // A person reviewed why the token keeps an authority.
  hasReviewedNote: boolean;
  // Null before the first check.
  safetyLevel: SafetyLevel | null;
};

export type SafetyCheck = {
  mint: string;
  isJupiterVerified: boolean;
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  // Dollars, as plain decimal text; the table keeps them to the cent.
  liquidityUsd: string | null;
  marketCapUsd: string | null;
  volume24hUsd: string | null;
  safetyLevel: SafetyLevel;
};

// The indexer's way into the tokens table's checks and stats. The list itself and its reviewed
// notes belong to the seed.
export type SafetyBook = {
  // Every token the app knows, listed or not, in list order.
  tokens(): Promise<TokenToCheck[]>;
  // Saves each token's checks, stats and level, and when they were checked.
  save(checks: readonly SafetyCheck[], checkedAt: Date): Promise<void>;
};

export function createSafetyBook(db: Database): SafetyBook {
  return {
    async tokens() {
      return db
        .select({
          mint: tokens.mint,
          symbol: tokens.symbol,
          hasReviewedNote: sql<boolean>`${tokens.safetyNote} is not null`,
          safetyLevel: tokens.safetyLevel,
        })
        .from(tokens)
        .orderBy(sql`${tokens.sortRank} asc nulls last`, asc(tokens.mint));
    },

    async save(checks, checkedAt) {
      if (checks.length === 0) {
        return;
      }
      await db.transaction(async (tx) => {
        for (const { mint, ...check } of checks) {
          await tx
            .update(tokens)
            .set({ ...check, safetyCheckedAt: checkedAt })
            .where(eq(tokens.mint, mint));
        }
      });
    },
  };
}
