// The platform fee (ADR 0005): an optional USDC fee inside each trade, off until the legal review.
// A buy pays it before the swap, a sell after; this module only says how much and where to.
import { associatedTokenAddress, USDC } from "@repo/solana";
import type { Address } from "@solana/kit";
import type { SolanaReader } from "../providers/solana/types";

export type FeeSettings =
  | { enabled: false }
  | { enabled: true; bps: number; wallet: string; usdcAccount: Address };

const WHOLE = 10_000;

/** Fee settings from the env. With fees on, also the account the fee wallet keeps its USDC in. */
export async function feeSettings(env: {
  FEES_ENABLED: boolean;
  PLATFORM_FEE_BPS: number;
  FEE_WALLET_ADDRESS?: string;
}): Promise<FeeSettings> {
  if (!env.FEES_ENABLED) {
    return { enabled: false };
  }
  if (env.FEE_WALLET_ADDRESS === undefined) {
    throw new Error("FEE_WALLET_ADDRESS is needed when FEES_ENABLED is true.");
  }
  return {
    enabled: true,
    bps: env.PLATFORM_FEE_BPS,
    wallet: env.FEE_WALLET_ADDRESS,
    usdcAccount: await associatedTokenAddress({
      owner: env.FEE_WALLET_ADDRESS,
      mint: USDC.mint,
      tokenProgram: "spl-token",
    }),
  };
}

/** The fee on `baseMicro` at `bps`: base × bps ÷ 10,000, rounded down, so it never overcharges. */
export function feeOn(baseMicro: bigint, bps: number): bigint {
  if (baseMicro < 0n) {
    throw new RangeError("A fee is charged on zero or more.");
  }
  if (!Number.isInteger(bps) || bps < 0 || bps > WHOLE) {
    throw new RangeError("A fee rate is a whole number of basis points from 0 to 10,000.");
  }
  return (baseMicro * BigInt(bps)) / BigInt(WHOLE);
}

/** A buy pays its fee off the top of the USDC it spends, and swaps the rest. */
export function buyFee(
  settings: FeeSettings,
  amountMicro: bigint,
): { feeMicro: bigint; swapInMicro: bigint } {
  const feeMicro = settings.enabled ? feeOn(amountMicro, settings.bps) : 0n;
  return { feeMicro, swapInMicro: amountMicro - feeMicro };
}

/** A sell pays its fee from the least USDC it is sure to receive, so the fee is always covered. */
export function sellFee(settings: FeeSettings, minOutMicro: bigint): bigint {
  return settings.enabled ? feeOn(minOutMicro, settings.bps) : 0n;
}

/**
 * With fees on, the fee wallet's USDC account must exist and be able to take USDC, or every trade
 * would fail on its fee. The API runs this before it starts and refuses to start if it throws.
 */
export async function checkFeeWallet(settings: FeeSettings, solana: SolanaReader): Promise<void> {
  if (!settings.enabled) {
    return;
  }
  const where = `The fee wallet's USDC account ${settings.usdcAccount}`;
  let account: Awaited<ReturnType<SolanaReader["getTokenAccount"]>>;
  try {
    account = await solana.getTokenAccount(settings.usdcAccount);
  } catch (error) {
    // Only the error's name: a Solana error can carry the RPC address, which holds a key.
    const name = error instanceof Error ? error.name : "Error";
    throw new Error(`Couldn't read ${where} from Solana (${name}). Fees need it to start.`);
  }
  if (account === null) {
    throw new Error(
      `The fee wallet ${settings.wallet} has no USDC account at ${settings.usdcAccount}. Create it before turning fees on.`,
    );
  }
  if (account.mint !== USDC.mint) {
    throw new Error(`${where} doesn't hold USDC.`);
  }
  if (account.owner !== settings.wallet) {
    throw new Error(`${where} belongs to another wallet.`);
  }
  if (account.frozen) {
    throw new Error(`${where} is frozen, so it can't receive fees.`);
  }
}
