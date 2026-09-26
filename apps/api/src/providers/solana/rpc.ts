import {
  address,
  createSolanaRpc,
  createSolanaRpcFromTransport,
  type RpcTransport,
} from "@solana/kit";
import { z } from "zod";
import type { SolanaReader } from "./types";

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

export type SolanaReaderOptions =
  | { url: string }
  // Tests answer in place of a Solana server.
  | { transport: RpcTransport };

export function createSolanaReader(options: SolanaReaderOptions): SolanaReader {
  const rpc =
    "url" in options
      ? createSolanaRpc(options.url)
      : createSolanaRpcFromTransport(options.transport);
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
  };
}
