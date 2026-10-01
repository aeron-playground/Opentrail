import { type Address, address, createNoopSigner, type Instruction } from "@solana/kit";
import { getTransferCheckedInstruction } from "@solana-program/token";
import { USDC } from "./mints";

export type UsdcFeeInput = {
  // The person paying: they sign the transaction in their own wallet.
  owner: Address;
  // Their USDC account, and the fee wallet's.
  from: Address;
  to: Address;
  amountMicro: bigint;
};

/**
 * The platform fee, as a USDC transfer from the person's account to the fee wallet's (ADR 0005).
 * `TransferChecked` names the mint and its decimals, so the token program refuses anything but
 * USDC. Null for a fee of zero, so a trade with fees off carries no fee instruction.
 */
export function usdcFeeInstruction({
  owner,
  from,
  to,
  amountMicro,
}: UsdcFeeInput): Instruction | null {
  if (amountMicro < 0n) {
    throw new RangeError("A fee can't be below zero.");
  }
  if (amountMicro === 0n) {
    return null;
  }
  return getTransferCheckedInstruction({
    source: from,
    mint: address(USDC.mint),
    destination: to,
    // A stand-in that marks the owner as a signer without holding any key: the person's wallet
    // signs later, and the server never can.
    authority: createNoopSigner(owner),
    amount: amountMicro,
    decimals: USDC.decimals,
  });
}
