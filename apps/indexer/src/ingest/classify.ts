// What a transaction means for each of our wallets. Pure: no database, no network.
import { SOL } from "@repo/solana";
import type { NormalizedTx } from "./normalize-rpc";

export type Deposit = {
  wallet: string;
  mint: string;
  decimals: number;
  amountRaw: bigint;
  // The one account that sent it, when the transaction shows exactly one.
  counterparty: string | null;
};

// Money that only came in counts as deposits. Anything that also sent money out (a withdrawal,
// a swap) is left for the trading and withdrawal classifiers, which come later.
export function findDeposits(tx: NormalizedTx, watched: ReadonlySet<string>): Deposit[] {
  if (tx.failed) {
    return [];
  }
  const wallets = new Set(
    [
      ...tx.tokenDeltas.map((delta) => delta.owner),
      ...tx.solDeltas.map((delta) => delta.owner),
    ].filter((owner) => watched.has(owner)),
  );
  return [...wallets].flatMap((wallet) => depositsFor(tx, wallet));
}

function depositsFor(tx: NormalizedTx, wallet: string): Deposit[] {
  // Native SOL and wrapped SOL share the wSOL mint, so their changes add up into one.
  const changes = new Map<string, { decimals: number; delta: bigint }>();
  const add = (mint: string, decimals: number, delta: bigint) => {
    const change = changes.get(mint) ?? { decimals, delta: 0n };
    change.delta += delta;
    changes.set(mint, change);
  };
  for (const delta of tx.tokenDeltas) {
    if (delta.owner === wallet) add(delta.mint, delta.decimals, delta.deltaRaw);
  }
  const sol = solDeltaOf(tx, wallet);
  if (sol !== 0n) add(SOL.mint, SOL.decimals, sol);

  const moved = [...changes].filter(([, change]) => change.delta !== 0n);
  if (moved.length === 0 || moved.some(([, change]) => change.delta < 0n)) {
    return [];
  }
  return moved.map(([mint, change]) => ({
    wallet,
    mint,
    decimals: change.decimals,
    amountRaw: change.delta,
    counterparty: senderOf(tx, wallet, mint),
  }));
}

// A wallet's SOL change, without the network fee it paid: paying a fee isn't sending money.
function solDeltaOf(tx: NormalizedTx, owner: string): bigint {
  const sol = tx.solDeltas.find((delta) => delta.owner === owner);
  if (sol && !sol.exact) {
    throw new Error(`The SOL balance of ${owner} in ${tx.signature} is too large to read exactly`);
  }
  const fee = tx.feePayer === owner ? tx.networkFeeLamports : 0n;
  return (sol?.deltaLamports ?? 0n) + fee;
}

function senderOf(tx: NormalizedTx, wallet: string, mint: string): string | null {
  const senders = new Set(
    tx.tokenDeltas
      .filter((delta) => delta.mint === mint && delta.owner !== wallet && delta.deltaRaw < 0n)
      .map((delta) => delta.owner),
  );
  if (mint === SOL.mint) {
    for (const delta of tx.solDeltas) {
      const fee = tx.feePayer === delta.owner ? tx.networkFeeLamports : 0n;
      if (delta.owner !== wallet && delta.deltaLamports + fee < 0n) senders.add(delta.owner);
    }
  }
  const [only, ...others] = senders;
  return only !== undefined && others.length === 0 ? only : null;
}
