// A transaction as the RPC's getTransaction returns it, which is also how Helius "raw" webhooks
// deliver it, turned into who gained or lost how much of what.
import { z } from "zod";

export type TokenDelta = { owner: string; mint: string; decimals: number; deltaRaw: bigint };
export type SolDelta = {
  owner: string;
  deltaLamports: bigint;
  // False when a balance was too large for a JSON number to hold exactly (above 2^53 lamports,
  // about 9 million SOL). Only huge accounts like exchanges get there.
  exact: boolean;
};

export type NormalizedTx = {
  signature: string;
  slot: bigint;
  blockTime: Date;
  failed: boolean;
  feePayer: string;
  networkFeeLamports: bigint;
  tokenDeltas: TokenDelta[];
  solDeltas: SolDelta[];
};

const TokenBalanceSchema = z.object({
  accountIndex: z.number().int().nonnegative(),
  mint: z.string(),
  // Missing on some old transactions; those balances can't be matched to an owner.
  owner: z.string().optional(),
  uiTokenAmount: z.object({
    amount: z.string().regex(/^\d+$/),
    decimals: z.number().int().nonnegative(),
  }),
});

// Any whole number, even above 2^53: zod's int() refuses those, but we read them and flag them.
const Lamports = z.number().nonnegative().refine(Number.isInteger, "Expected a whole number");

const RpcTransactionSchema = z.object({
  slot: z.number().int().nonnegative(),
  blockTime: z.number().int().nullable(),
  meta: z.object({
    err: z.unknown(),
    fee: z.number().int().nonnegative(),
    preBalances: z.array(Lamports),
    postBalances: z.array(Lamports),
    preTokenBalances: z.array(TokenBalanceSchema).default([]),
    postTokenBalances: z.array(TokenBalanceSchema).default([]),
    // Accounts that versioned transactions load from address lookup tables.
    loadedAddresses: z
      .object({ writable: z.array(z.string()), readonly: z.array(z.string()) })
      .default({ writable: [], readonly: [] }),
  }),
  transaction: z.object({
    // At least one of each: the first signature names the transaction, the first account pays.
    signatures: z.tuple([z.string()], z.string()),
    message: z.object({ accountKeys: z.tuple([z.string()], z.string()) }),
  }),
});

export function normalizeRpcTransaction(input: unknown): NormalizedTx {
  const parsed = RpcTransactionSchema.safeParse(input);
  if (!parsed.success) {
    // prettifyError names each field and the problem in a line, which reads well in last_error.
    throw new Error(`Not a transaction in the RPC shape:\n${z.prettifyError(parsed.error)}`);
  }
  const { slot, blockTime, meta, transaction } = parsed.data;
  const [signature] = transaction.signatures;
  const [feePayer] = transaction.message.accountKeys;
  if (blockTime === null) {
    throw new Error(`Transaction ${signature} has no block time yet`);
  }
  // Balances follow this order: the message's own accounts, then the loaded ones.
  const accounts = [
    ...transaction.message.accountKeys,
    ...meta.loadedAddresses.writable,
    ...meta.loadedAddresses.readonly,
  ];
  if (meta.preBalances.length !== accounts.length || meta.postBalances.length !== accounts.length) {
    throw new Error(`Transaction ${signature} has balances that don't match its accounts`);
  }

  const solDeltas: SolDelta[] = [];
  accounts.forEach((owner, index) => {
    const before = meta.preBalances[index] ?? 0;
    const after = meta.postBalances[index] ?? 0;
    if (before !== after) {
      solDeltas.push({
        owner,
        deltaLamports: BigInt(after) - BigInt(before),
        exact: Number.isSafeInteger(before) && Number.isSafeInteger(after),
      });
    }
  });

  // A token account that is new has no "before", and one that was closed has no "after".
  const tokens = new Map<string, TokenDelta>();
  const add = (balance: z.infer<typeof TokenBalanceSchema>, sign: 1n | -1n) => {
    if (balance.owner === undefined) {
      return;
    }
    const key = `${balance.owner}\n${balance.mint}`;
    const entry = tokens.get(key) ?? {
      owner: balance.owner,
      mint: balance.mint,
      decimals: balance.uiTokenAmount.decimals,
      deltaRaw: 0n,
    };
    entry.deltaRaw += sign * BigInt(balance.uiTokenAmount.amount);
    tokens.set(key, entry);
  };
  for (const balance of meta.preTokenBalances) add(balance, -1n);
  for (const balance of meta.postTokenBalances) add(balance, 1n);

  return {
    signature,
    slot: BigInt(slot),
    blockTime: new Date(blockTime * 1000),
    failed: meta.err !== null && meta.err !== undefined,
    feePayer,
    networkFeeLamports: BigInt(meta.fee),
    tokenDeltas: [...tokens.values()].filter((delta) => delta.deltaRaw !== 0n),
    solDeltas,
  };
}
