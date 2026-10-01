import { describe, expect, test } from "bun:test";
import { AccountRole, address, generateKeyPairSigner } from "@solana/kit";
import { parseTransferCheckedInstruction, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { usdcFeeInstruction } from "./fee-instruction";
import { USDC } from "./mints";

// Throwaway keys made for these tests; they hold nothing and never touch a network.
const someAddress = async () => (await generateKeyPairSigner()).address;
const OWNER = await someAddress();
const FROM = await someAddress();
const TO = await someAddress();

describe("usdcFeeInstruction", () => {
  test("moves the fee in USDC from the person's account to the fee wallet's, signed by the person", () => {
    const instruction = usdcFeeInstruction({
      owner: OWNER,
      from: FROM,
      to: TO,
      amountMicro: 100_000n,
    });
    if (instruction === null) throw new Error("expected an instruction");

    expect(instruction.programAddress).toBe(TOKEN_PROGRAM_ADDRESS);
    const parsed = parseTransferCheckedInstruction(
      instruction as Parameters<typeof parseTransferCheckedInstruction>[0],
    );
    expect(parsed.data.amount).toBe(100_000n);
    expect(parsed.data.decimals).toBe(USDC.decimals);
    expect(parsed.accounts.source.address).toBe(FROM);
    expect(parsed.accounts.mint.address).toBe(address(USDC.mint));
    expect(parsed.accounts.destination.address).toBe(TO);
    expect(parsed.accounts.authority.address).toBe(OWNER);
    expect(parsed.accounts.authority.role).toBe(AccountRole.READONLY_SIGNER);
  });

  test("adds nothing when the fee is zero, as with fees off", () => {
    expect(usdcFeeInstruction({ owner: OWNER, from: FROM, to: TO, amountMicro: 0n })).toBeNull();
  });

  test("refuses a negative fee", () => {
    expect(() =>
      usdcFeeInstruction({ owner: OWNER, from: FROM, to: TO, amountMicro: -1n }),
    ).toThrow(RangeError);
  });
});
