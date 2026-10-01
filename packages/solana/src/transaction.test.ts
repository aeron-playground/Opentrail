import { describe, expect, test } from "bun:test";
import {
  AccountRole,
  type Address,
  type Blockhash,
  generateKeyPairSigner,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type Instruction,
} from "@solana/kit";
import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  parseSetComputeUnitLimitInstruction,
  parseSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget";
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { usdcFeeInstruction } from "./fee-instruction";
import {
  buildSwapTransaction,
  MAX_TRANSACTION_BYTES,
  messageHash,
  swapInstructions,
} from "./transaction";

// Throwaway keys made for these tests; they hold nothing and are never used on a network.
const someAddress = async () => (await generateKeyPairSigner()).address;
const payer = await someAddress();
const lifetime = {
  blockhash: (await someAddress()) as string as Blockhash,
  lastValidBlockHeight: 300_000_000n,
};

// Stand-ins for Jupiter's instructions, told apart by their programs and data.
const step = (
  programAddress: Address,
  tag: number,
  accounts: Address[] = [],
  size = 1,
): Instruction => ({
  programAddress,
  accounts: accounts.map((a) => ({ address: a, role: AccountRole.READONLY })),
  data: new Uint8Array(size).fill(tag),
});
const SETUP = step(ASSOCIATED_TOKEN_PROGRAM_ADDRESS, 1);
const SWAP = step(TOKEN_PROGRAM_ADDRESS, 2);
const CLEANUP = step(TOKEN_PROGRAM_ADDRESS, 3);
const parts = { setup: [SETUP], swap: SWAP, cleanup: [CLEANUP] };
const fee = usdcFeeInstruction({
  owner: payer,
  from: await someAddress(),
  to: await someAddress(),
  amountMicro: 1_000n,
});
const plan = { fee, parts, computeUnitLimit: 53_095, priorityMicroLamports: 300_000n };

describe("swapInstructions", () => {
  test("a buy pays the fee before the swap", () => {
    const list = swapInstructions({ ...plan, side: "buy" });
    expect(list.slice(2)).toEqual([fee as Instruction, SETUP, SWAP, CLEANUP]);
  });

  test("a sell pays the fee after the swap, before the cleanup", () => {
    const list = swapInstructions({ ...plan, side: "sell" });
    expect(list.slice(2)).toEqual([SETUP, SWAP, fee as Instruction, CLEANUP]);
  });

  test("starts with the compute unit limit and price", () => {
    const [limit, price] = swapInstructions({ ...plan, side: "buy" });
    expect(limit?.programAddress).toBe(COMPUTE_BUDGET_PROGRAM_ADDRESS);
    expect(parseSetComputeUnitLimitInstruction(limit as never).data.units).toBe(53_095);
    expect(parseSetComputeUnitPriceInstruction(price as never).data.microLamports).toBe(300_000n);
  });

  test.each(["buy", "sell"] as const)("a %s with fees off has no fee instruction", (side) => {
    expect(swapInstructions({ ...plan, side, fee: null }).slice(2)).toEqual([SETUP, SWAP, CLEANUP]);
  });
});

describe("buildSwapTransaction", () => {
  test("builds a version 0 transaction the payer alone signs, with the hash of its message", async () => {
    const built = await buildSwapTransaction({
      ...plan,
      side: "buy",
      payer,
      lifetime,
      lookupTables: {},
    });
    if (!built.fits) throw new Error("expected it to fit");

    const transaction = getTransactionDecoder().decode(getBase64Encoder().encode(built.base64));
    const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
    expect(message.version).toBe(0);
    expect(message.header.numSignerAccounts).toBe(1);
    expect(message.staticAccounts[0]).toBe(payer);
    expect(message.lifetimeToken).toBe(lifetime.blockhash);
    expect(Object.keys(transaction.signatures)).toEqual([payer]);
    expect(built.bytes).toBe(getBase64Encoder().encode(built.base64).byteLength);
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(transaction.messageBytes)),
    );
    expect(built.messageHash).toBe(
      Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join(""),
    );
  });

  test(`refuses a transaction over ${MAX_TRANSACTION_BYTES} bytes, and says how big it was`, async () => {
    const huge = { ...parts, swap: step(TOKEN_PROGRAM_ADDRESS, 2, [], 1_200) };
    const built = await buildSwapTransaction({
      ...plan,
      parts: huge,
      side: "buy",
      payer,
      lifetime,
      lookupTables: {},
    });
    expect(built.fits).toBe(false);
    expect(built.bytes).toBeGreaterThan(MAX_TRANSACTION_BYTES);
  });

  test("uses lookup tables to make the transaction smaller", async () => {
    const accounts = await Promise.all(Array.from({ length: 30 }, someAddress));
    const wide = { ...parts, swap: step(TOKEN_PROGRAM_ADDRESS, 2, accounts) };
    const table = await someAddress();
    const without = await buildSwapTransaction({
      ...plan,
      parts: wide,
      side: "buy",
      payer,
      lifetime,
      lookupTables: {},
    });
    const withTable = await buildSwapTransaction({
      ...plan,
      parts: wide,
      side: "buy",
      payer,
      lifetime,
      lookupTables: { [table]: accounts },
    });
    // Each of the 30 accounts shrinks from a 32-byte address to a 1-byte index into the table (31
    // bytes each); the table itself adds its 32-byte address and two 1-byte index counts.
    expect(without.bytes - withTable.bytes).toBe(30 * 31 - 34);
  });
});

describe("messageHash", () => {
  test("is the same for the same bytes, and changes with one byte", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    expect(await messageHash(bytes)).toBe(await messageHash(new Uint8Array([1, 2, 3, 4])));
    expect(await messageHash(bytes)).not.toBe(await messageHash(new Uint8Array([1, 2, 3, 5])));
    expect(await messageHash(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
