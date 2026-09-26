// Saves what one transaction means for our users. It runs inside the inbox's database transaction,
// so the rows and the notifications count only once the event is marked processed too.
import { BALANCE_CHANGED_CHANNEL, type Transaction, transfers, users } from "@repo/db";
import { USDC } from "@repo/solana";
import { inArray, sql } from "drizzle-orm";
import { findDeposits } from "./classify";
import type { NormalizedTx } from "./normalize-rpc";

export type RecordResult = {
  // New rows only: a transaction seen before adds none.
  deposits: number;
  usersNotified: number;
};

export async function recordTransaction(
  tx: Transaction,
  normalized: NormalizedTx,
): Promise<RecordResult> {
  const wallets = new Set(
    [...normalized.tokenDeltas, ...normalized.solDeltas].map((delta) => delta.owner),
  );
  if (wallets.size === 0) {
    return { deposits: 0, usersNotified: 0 };
  }
  const ours = await tx
    .select({ id: users.id, walletAddress: users.walletAddress })
    .from(users)
    .where(inArray(users.walletAddress, [...wallets]));

  const rows = ours.flatMap((user) =>
    findDeposits(normalized, new Set([user.walletAddress])).map((deposit) => ({
      userId: user.id,
      walletAddress: user.walletAddress,
      signature: normalized.signature,
      slot: normalized.slot,
      blockTime: normalized.blockTime,
      direction: "in" as const,
      mint: deposit.mint,
      amountRaw: deposit.amountRaw,
      counterparty: deposit.counterparty,
      kind: "deposit" as const,
      // USDC's raw unit is exactly one micro-USDC. Other tokens need a price, which comes later.
      usdValueMicro: deposit.mint === USDC.mint ? deposit.amountRaw : null,
    })),
  );
  const saved =
    rows.length === 0
      ? []
      : await tx
          .insert(transfers)
          .values(rows)
          .onConflictDoNothing()
          .returning({ id: transfers.id });

  // Every wallet here gained or lost something, a deposit or not (a fee, a trade elsewhere), so
  // each owner's balances are worth reading again. Postgres sends these at commit, never before.
  for (const user of ours) {
    await tx.execute(sql`select pg_notify(${BALANCE_CHANGED_CHANNEL}, ${user.id})`);
  }
  return { deposits: saved.length, usersNotified: ours.length };
}
