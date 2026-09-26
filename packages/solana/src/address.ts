import { isAddress } from "@solana/kit";

/** True for a Solana address: base58 text that decodes to exactly 32 bytes. */
export function isSolanaAddress(value: string): boolean {
  return isAddress(value);
}
