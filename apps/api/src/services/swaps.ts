// Swap quotes (ADR 0006, ADR 0019): checks a trade, asks the swap provider for a route, builds one
// transaction with our compute budget and fee, simulates it, and saves it as an intent the person
// can sign for the next 45 seconds. Nothing here signs or sends anything.
import { type Database, type SwapSide, swapIntents, tokens } from "@repo/db";
import { marketValue } from "@repo/pnl";
import { AppError } from "@repo/server";
import {
  associatedTokenAddress,
  buildSwapTransaction,
  SOL,
  USDC,
  usdcFeeInstruction,
} from "@repo/solana";
import { AccountRole, address, type Instruction } from "@solana/kit";
import { eq } from "drizzle-orm";
import type { Simulation, SolanaReader } from "../providers/solana/types";
import { type SwapProvider, SwapProviderError, type SwapRoute } from "../providers/swap/types";
import { buyFee, type FeeSettings, sellFee } from "./fees";
import type { PriceReader } from "./prices";

// How long the person has to sign: blockhashes last 60–90 s, so this leaves time to send.
export const QUOTE_TTL_MS = 45_000;
// Asked in this order: fewer accounts make a smaller transaction (ADR 0019).
export const MAX_ACCOUNTS_STEPS = [54, 40, 30] as const;
// At or above it, the person must confirm a second time.
export const HIGH_IMPACT_BPS = 500;
// The most compute units a transaction may use: the first simulation runs with it.
const MAX_COMPUTE_UNITS = 1_400_000;
const MIN_TRADE_MICRO = 1_000_000n;
// Solana's fee for the one signature a trade carries.
const BASE_FEE_LAMPORTS = 5_000n;
const MICRO_PER_DOLLAR = 1_000_000n;
// Solana takes at most this many accounts in one priority fee request.
const MAX_PRIORITY_FEE_ACCOUNTS = 128;

export type TradeLimits = {
  // Whole dollars.
  maxTradeUsd: number;
  minSolForFeesLamports: bigint;
  maxPriorityFeeMicroLamports: bigint;
};

export type QuoteRequest = {
  userId: string;
  // From the person's sign-in on the server, never from the request.
  wallet: string;
  side: SwapSide;
  // The token bought or sold for USDC.
  mint: string;
  // A buy spends this much micro-USDC, fee included; a sell sells this many raw token units.
  amountRaw: bigint;
  slippageBps: number;
  acceptHighImpact: boolean;
};

export type Quote = {
  id: string;
  side: SwapSide;
  mint: string;
  inputMint: string;
  outputMint: string;
  inAmountRaw: bigint;
  // What the swap itself gives. On a sell, the fee comes out of it afterwards.
  expectedOutRaw: bigint;
  minOutRaw: bigint;
  feeBps: number;
  feeUsdcMicro: bigint;
  slippageBps: number;
  priceImpactBps: number;
  routeLabel: string;
  providerFeeBps: number;
  // The signature fee plus the priority fee at the compute limit: the most the network takes.
  networkFeeLamports: bigint;
  // The unsigned transaction, base64, for the person's wallet to sign.
  transaction: string;
  expiresAt: Date;
};

export type SwapService = {
  quote(request: QuoteRequest): Promise<Quote>;
};

export type SwapServiceDeps = {
  db: Database;
  solana: SolanaReader;
  swaps: SwapProvider;
  fees: FeeSettings;
  prices: PriceReader;
  limits: TradeLimits;
  now?: () => Date;
};

export function createSwapService({
  db,
  solana,
  swaps,
  fees,
  prices,
  limits,
  now = () => new Date(),
}: SwapServiceDeps): SwapService {
  // The token must be one we list, and not one marked high risk.
  async function tradableToken(mint: string) {
    if (mint === USDC.mint) {
      throw new AppError("TOKEN_NOT_SUPPORTED");
    }
    const [token] = await db.select().from(tokens).where(eq(tokens.mint, mint));
    if (!token?.isListed || token.safetyLevel === "high_risk") {
      throw new AppError("TOKEN_NOT_SUPPORTED");
    }
    return token;
  }

  // What the trade is worth in micro-USDC: a buy spends USDC; a sell is valued at the stored price.
  async function valueMicro(request: QuoteRequest, decimals: number): Promise<bigint> {
    if (request.side === "buy") {
      return request.amountRaw;
    }
    const [price] = await prices.current([request.mint]);
    if (!price) {
      throw new AppError("QUOTE_UNAVAILABLE");
    }
    return marketValue(request.amountRaw, decimals, price.priceUsd);
  }

  async function checkBalances(request: QuoteRequest): Promise<void> {
    const sellsSol = request.side === "sell" && request.mint === SOL.mint;
    const [solLamports, inputRaw] = await Promise.all([
      solana.getSolBalance(request.wallet),
      sellsSol
        ? Promise.resolve(0n)
        : solana.getTokenBalance(request.wallet, request.side === "buy" ? USDC.mint : request.mint),
    ]);
    if (solLamports < limits.minSolForFeesLamports) {
      throw new AppError("INSUFFICIENT_SOL_FOR_FEES");
    }
    // Selling SOL keeps the network fee reserve in the wallet.
    const spendable = sellsSol ? solLamports - limits.minSolForFeesLamports : inputRaw;
    if (request.amountRaw > spendable) {
      throw new AppError("INSUFFICIENT_BALANCE");
    }
  }

  async function route(request: QuoteRequest, swapInRaw: bigint, maxAccounts: number) {
    try {
      return await swaps.getSwapInstructions({
        inputMint: request.side === "buy" ? USDC.mint : request.mint,
        outputMint: request.side === "buy" ? request.mint : USDC.mint,
        amountRaw: swapInRaw,
        slippageBps: request.slippageBps,
        userPublicKey: request.wallet,
        maxAccounts,
      });
    } catch (error) {
      if (error instanceof SwapProviderError) {
        throw new AppError(error.failure === "no_route" ? "QUOTE_UNAVAILABLE" : "QUOTE_BUSY", {
          cause: error,
        });
      }
      throw error;
    }
  }

  return {
    async quote(request) {
      const token = await tradableToken(request.mint);
      const value = await valueMicro(request, token.decimals);
      if (value < MIN_TRADE_MICRO) {
        throw new AppError("AMOUNT_TOO_SMALL");
      }
      if (value > BigInt(limits.maxTradeUsd) * MICRO_PER_DOLLAR) {
        throw new AppError("AMOUNT_TOO_LARGE");
      }
      await checkBalances(request);

      const buy = request.side === "buy" ? buyFee(fees, request.amountRaw) : null;
      const swapInRaw = buy ? buy.swapInMicro : request.amountRaw;
      const payer = address(request.wallet);
      const userUsdc = await associatedTokenAddress({
        owner: request.wallet,
        mint: USDC.mint,
        tokenProgram: "spl-token",
      });
      const lifetime = await solana.getLatestBlockhash();

      // The first route whose transaction fits; the compute budget doesn't change the size.
      let chosen: Chosen | null = null;
      for (const maxAccounts of MAX_ACCOUNTS_STEPS) {
        const candidate = await route(request, swapInRaw, maxAccounts);
        const feeMicro = buy ? buy.feeMicro : sellFee(fees, candidate.minOutRaw);
        const feeInstruction = fees.enabled
          ? usdcFeeInstruction({
              owner: payer,
              from: userUsdc,
              to: fees.usdcAccount,
              amountMicro: feeMicro,
            })
          : null;
        const lookupTables = await solana.getLookupTables(candidate.addressLookupTableAddresses);
        const plan = {
          side: request.side,
          fee: feeInstruction,
          parts: candidate.parts,
          payer,
          lifetime,
          lookupTables,
        };
        const draft = await buildSwapTransaction({
          ...plan,
          computeUnitLimit: MAX_COMPUTE_UNITS,
          priorityMicroLamports: 0n,
        });
        if (draft.fits) {
          chosen = { route: candidate, feeMicro, plan, draft: draft.base64 };
          break;
        }
      }
      if (!chosen) {
        throw new AppError("QUOTE_UNAVAILABLE");
      }
      if (chosen.route.priceImpactBps >= HIGH_IMPACT_BPS && !request.acceptHighImpact) {
        throw new AppError("PRICE_IMPACT_TOO_HIGH");
      }

      const [simulation, recentFees] = await Promise.all([
        solana.simulate(chosen.draft),
        solana.getRecentPriorityFees(writableAccounts(chosen.route.parts.swap)),
      ]);
      const computeUnitLimit = unitLimit(simulation);
      const priorityMicroLamports = minBigint(
        paidMedian(recentFees),
        limits.maxPriorityFeeMicroLamports,
      );
      const built = await buildSwapTransaction({
        ...chosen.plan,
        computeUnitLimit,
        priorityMicroLamports,
      });
      // Only the compute budget changed, and it has a fixed size.
      if (!built.fits) {
        throw new AppError("QUOTE_UNAVAILABLE");
      }

      const feeBps = fees.enabled ? fees.bps : 0;
      const expiresAt = new Date(now().getTime() + QUOTE_TTL_MS);
      const [intent] = await db
        .insert(swapIntents)
        .values({
          userId: request.userId,
          side: request.side,
          inputMint: request.side === "buy" ? USDC.mint : request.mint,
          outputMint: request.side === "buy" ? request.mint : USDC.mint,
          inAmountRaw: request.amountRaw,
          expectedOutRaw: chosen.route.expectedOutRaw,
          minOutRaw: chosen.route.minOutRaw,
          feeBps,
          feeUsdcMicro: chosen.feeMicro,
          slippageBps: request.slippageBps,
          priceImpactBps: chosen.route.priceImpactBps,
          provider: swaps.name,
          routeLabel: chosen.route.routeLabel,
          messageHash: built.messageHash,
          lastValidBlockHeight: lifetime.lastValidBlockHeight,
          expiresAt,
        })
        .returning({ id: swapIntents.id });
      if (!intent) {
        throw new Error("Saving the swap intent returned no row");
      }

      return {
        id: intent.id,
        side: request.side,
        mint: request.mint,
        inputMint: request.side === "buy" ? USDC.mint : request.mint,
        outputMint: request.side === "buy" ? request.mint : USDC.mint,
        inAmountRaw: request.amountRaw,
        expectedOutRaw: chosen.route.expectedOutRaw,
        minOutRaw: chosen.route.minOutRaw,
        feeBps,
        feeUsdcMicro: chosen.feeMicro,
        slippageBps: request.slippageBps,
        priceImpactBps: chosen.route.priceImpactBps,
        routeLabel: chosen.route.routeLabel,
        providerFeeBps: chosen.route.providerFeeBps,
        networkFeeLamports:
          BASE_FEE_LAMPORTS + ceilDiv(BigInt(computeUnitLimit) * priorityMicroLamports, 1_000_000n),
        transaction: built.base64,
        expiresAt,
      };
    },
  };
}

type Chosen = {
  route: SwapRoute;
  feeMicro: bigint;
  plan: Omit<
    Parameters<typeof buildSwapTransaction>[0],
    "computeUnitLimit" | "priorityMicroLamports"
  >;
  draft: string;
};

// The compute limit: what the simulation used plus 10%, rounded up (ADR 0019). A failed run means
// the trade would fail if sent, so it never gets that far.
function unitLimit(simulation: Simulation): number {
  if (simulation.error !== null) {
    const outOfSol =
      simulation.error === "InsufficientFundsForFee" ||
      simulation.logs.some((line) => /insufficient lamports/i.test(line));
    throw new AppError(outOfSol ? "INSUFFICIENT_SOL_FOR_FEES" : "TX_SIMULATION_FAILED");
  }
  if (simulation.unitsConsumed === null) {
    throw new AppError("QUOTE_UNAVAILABLE");
  }
  const withMargin = ceilDiv(simulation.unitsConsumed * 11n, 10n);
  return Number(minBigint(withMargin, BigInt(MAX_COMPUTE_UNITS)));
}

// The accounts the swap writes to, such as its pools: busy ones need a higher priority fee.
function writableAccounts(swap: Instruction): string[] {
  return (swap.accounts ?? [])
    .filter(
      (account) =>
        account.role === AccountRole.WRITABLE || account.role === AccountRole.WRITABLE_SIGNER,
    )
    .map((account) => account.address)
    .slice(0, MAX_PRIORITY_FEE_ACCOUNTS);
}

// What other transactions paid to get in: the middle of the slots where anyone paid (the lower
// one of an even count). A slot shows 0 when nobody wrote to these accounts then, which says
// nothing about the price, and on mainnet most slots do (118 of 150 for a real swap's accounts).
function paidMedian(values: readonly bigint[]): bigint {
  const paid = values.filter((fee) => fee > 0n).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return paid[Math.floor((paid.length - 1) / 2)] ?? 0n;
}

const minBigint = (a: bigint, b: bigint) => (a < b ? a : b);
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;
