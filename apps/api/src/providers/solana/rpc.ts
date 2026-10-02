import {
  address,
  type Base64EncodedWireTransaction,
  createSolanaRpc,
  createSolanaRpcFromTransport,
  fetchAddressesForLookupTables,
  type RpcTransport,
  signature,
} from "@solana/kit";
import { z } from "zod";
import type {
  SignatureStatus,
  Simulation,
  SolanaReader,
  SolanaSender,
  TokenAccount,
} from "./types";

// Funds count once a supermajority of the network has voted on them, as the UI shows.
const COMMITMENT = "confirmed";
// A person waits on these reads.
const TIMEOUT_MS = 5_000;

const RAW_AMOUNT = /^\d+$/;

const TokenAccountsSchema = z.array(
  z.object({
    account: z.object({
      data: z.object({
        parsed: z.object({
          info: z.object({ tokenAmount: z.object({ amount: z.string().regex(RAW_AMOUNT) }) }),
        }),
      }),
    }),
  }),
);

// Both token programs answer in this shape; anything else at the address isn't a token account.
const TokenAccountSchema = z.object({
  data: z.object({
    program: z.enum(["spl-token", "spl-token-2022"]),
    parsed: z.object({
      type: z.literal("account"),
      info: z.object({ mint: z.string(), owner: z.string(), state: z.string() }),
    }),
  }),
});

const SimulationSchema = z.object({
  err: z.unknown(),
  logs: z.array(z.string()).nullable(),
  unitsConsumed: z.bigint().nullish(),
});

// Solana's own limit for one priority fee request.
const MAX_PRIORITY_FEE_ACCOUNTS = 128;

export type SolanaReaderOptions =
  | { url: string }
  // Tests answer in place of a Solana server.
  | { transport: RpcTransport };

const rpcFor = (options: SolanaReaderOptions) =>
  "url" in options ? createSolanaRpc(options.url) : createSolanaRpcFromTransport(options.transport);

const SignatureStatusSchema = z
  .object({
    confirmationStatus: z.enum(["processed", "confirmed", "finalized"]).nullable(),
    err: z.unknown(),
  })
  .nullable();

export function createSolanaSender(options: SolanaReaderOptions): SolanaSender {
  const rpc = rpcFor(options);
  return {
    async sendTransaction(base64) {
      return rpc
        .sendTransaction(base64 as Base64EncodedWireTransaction, {
          encoding: "base64",
          skipPreflight: true,
          maxRetries: 0n,
        })
        .send({ abortSignal: AbortSignal.timeout(TIMEOUT_MS) });
    },

    async getSignatureStatus(sig): Promise<SignatureStatus | null> {
      const { value } = await rpc
        // Recent transactions only: the sender follows a trade for about a minute and a half.
        .getSignatureStatuses([signature(sig)], { searchTransactionHistory: false })
        .send({ abortSignal: AbortSignal.timeout(TIMEOUT_MS) });
      const status = SignatureStatusSchema.parse(value[0] ?? null);
      return status && { confirmationStatus: status.confirmationStatus, error: status.err ?? null };
    },

    async getBlockHeight() {
      return rpc
        .getBlockHeight({ commitment: COMMITMENT })
        .send({ abortSignal: AbortSignal.timeout(TIMEOUT_MS) });
    },
  };
}

export function createSolanaReader(options: SolanaReaderOptions): SolanaReader {
  const rpc = rpcFor(options);
  return {
    async getSolBalance(owner) {
      const { value } = await rpc
        .getBalance(address(owner), { commitment: COMMITMENT })
        .send({ abortSignal: AbortSignal.timeout(TIMEOUT_MS) });
      return BigInt(value);
    },

    async getTokenBalance(owner, mint) {
      const { value } = await rpc
        .getTokenAccountsByOwner(
          address(owner),
          { mint: address(mint) },
          { encoding: "jsonParsed", commitment: COMMITMENT },
        )
        .send({ abortSignal: AbortSignal.timeout(TIMEOUT_MS) });
      // An RPC server is an outside answer: check its shape before trusting the numbers.
      return TokenAccountsSchema.parse(value).reduce(
        (sum, { account }) => sum + BigInt(account.data.parsed.info.tokenAmount.amount),
        0n,
      );
    },

    async getTokenAccount(account): Promise<TokenAccount | null> {
      const { value } = await rpc
        .getAccountInfo(address(account), { encoding: "jsonParsed", commitment: COMMITMENT })
        .send({ abortSignal: AbortSignal.timeout(TIMEOUT_MS) });
      const parsed = TokenAccountSchema.safeParse(value);
      if (!parsed.success) {
        return null;
      }
      const { mint, owner, state } = parsed.data.data.parsed.info;
      return { mint, owner, frozen: state === "frozen" };
    },

    async getLatestBlockhash() {
      const { value } = await rpc
        .getLatestBlockhash({ commitment: COMMITMENT })
        .send({ abortSignal: AbortSignal.timeout(TIMEOUT_MS) });
      return { blockhash: value.blockhash, lastValidBlockHeight: value.lastValidBlockHeight };
    },

    getLookupTables(tables) {
      return fetchAddressesForLookupTables(tables.map(address), rpc, {
        commitment: COMMITMENT,
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      });
    },

    async simulate(base64): Promise<Simulation> {
      const { value } = await rpc
        .simulateTransaction(base64 as Base64EncodedWireTransaction, {
          encoding: "base64",
          // Nothing is signed yet, and a fresh blockhash keeps the run about the trade itself.
          sigVerify: false,
          replaceRecentBlockhash: true,
          commitment: COMMITMENT,
        })
        .send({ abortSignal: AbortSignal.timeout(TIMEOUT_MS) });
      const parsed = SimulationSchema.parse(value);
      return {
        error: parsed.err ?? null,
        unitsConsumed: parsed.unitsConsumed ?? null,
        logs: parsed.logs ?? [],
      };
    },

    async getRecentPriorityFees(accounts) {
      if (accounts.length > MAX_PRIORITY_FEE_ACCOUNTS) {
        throw new RangeError(`Solana takes at most ${MAX_PRIORITY_FEE_ACCOUNTS} accounts here.`);
      }
      const fees = await rpc
        .getRecentPrioritizationFees(accounts.map(address))
        .send({ abortSignal: AbortSignal.timeout(TIMEOUT_MS) });
      return fees.map((fee) => BigInt(fee.prioritizationFee));
    },
  };
}
