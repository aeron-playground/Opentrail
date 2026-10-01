import {
  type Address,
  type AddressesByLookupTableAddress,
  appendTransactionMessageInstructions,
  type Blockhash,
  compileTransaction,
  compressTransactionMessageUsingAddressLookupTables,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getTransactionEncoder,
  type Instruction,
  pipe,
  type ReadonlyUint8Array,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget";

/** The most bytes Solana accepts in one transaction, signatures included. */
export const MAX_TRANSACTION_BYTES = 1232;

export type SwapSide = "buy" | "sell";

// A swap provider's instructions, in the order it gives them.
export type SwapParts = {
  setup: readonly Instruction[];
  swap: Instruction;
  cleanup: readonly Instruction[];
};

export type SwapPlan = {
  side: SwapSide;
  // Null with fees off, or for a fee of zero.
  fee: Instruction | null;
  parts: SwapParts;
  computeUnitLimit: number;
  priorityMicroLamports: bigint;
};

/**
 * Every instruction of a trade, in order (ADR 0019). A buy pays its USDC fee before the swap; a sell
 * pays it after, from the USDC the swap brings in. The compute budget always comes first.
 */
export function swapInstructions({
  side,
  fee,
  parts,
  computeUnitLimit,
  priorityMicroLamports,
}: SwapPlan): Instruction[] {
  const budget = [
    getSetComputeUnitLimitInstruction({ units: computeUnitLimit }),
    getSetComputeUnitPriceInstruction({ microLamports: priorityMicroLamports }),
  ];
  const feeStep = fee === null ? [] : [fee];
  return side === "buy"
    ? [...budget, ...feeStep, ...parts.setup, parts.swap, ...parts.cleanup]
    : [...budget, ...parts.setup, parts.swap, ...feeStep, ...parts.cleanup];
}

export type SwapTransactionInput = SwapPlan & {
  // The person: they pay the network fee and are the only signer.
  payer: Address;
  lookupTables: AddressesByLookupTableAddress;
  lifetime: { blockhash: Blockhash; lastValidBlockHeight: bigint };
};

export type BuiltSwapTransaction =
  | { fits: true; bytes: number; base64: string; messageHash: string }
  | { fits: false; bytes: number };

/**
 * A version 0 transaction for the trade, unsigned, with the hash of its message: the API keeps the
 * hash to recognise the transaction when it comes back signed. Over the size limit, it returns
 * only the size, so the caller can ask the provider for a smaller route.
 */
export async function buildSwapTransaction(
  input: SwapTransactionInput,
): Promise<BuiltSwapTransaction> {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(input.payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(input.lifetime, m),
    (m) => appendTransactionMessageInstructions(swapInstructions(input), m),
    (m) => compressTransactionMessageUsingAddressLookupTables(m, input.lookupTables),
  );
  const transaction = compileTransaction(message);
  const bytes = getTransactionEncoder().encode(transaction).byteLength;
  if (bytes > MAX_TRANSACTION_BYTES) {
    return { fits: false, bytes };
  }
  return {
    fits: true,
    bytes,
    base64: getBase64EncodedWireTransaction(transaction),
    messageHash: await messageHash(transaction.messageBytes),
  };
}

/** The SHA-256 of a transaction message, as lowercase hex. */
export async function messageHash(messageBytes: ReadonlyUint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new Uint8Array(messageBytes)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
