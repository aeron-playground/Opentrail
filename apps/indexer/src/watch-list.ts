import { type Database, users } from "@repo/db";
import { asc, inArray, isNull, sql } from "drizzle-orm";

export type UnwatchedWallet = { userId: string; walletAddress: string };

// The indexer's only write to users: when Helius started watching each user's wallet.
export type WatchList = {
  // Users whose wallets Helius doesn't watch yet, oldest account first.
  unwatched(limit: number): Promise<UnwatchedWallet[]>;
  markWatched(userIds: string[]): Promise<void>;
};

export function createWatchList(db: Database): WatchList {
  return {
    unwatched: (limit) =>
      db
        .select({ userId: users.id, walletAddress: users.walletAddress })
        .from(users)
        .where(isNull(users.webhookRegisteredAt))
        .orderBy(asc(users.createdAt))
        .limit(limit),

    async markWatched(userIds) {
      if (userIds.length === 0) {
        return;
      }
      await db
        .update(users)
        .set({ webhookRegisteredAt: sql`now()` })
        .where(inArray(users.id, userIds));
    },
  };
}
