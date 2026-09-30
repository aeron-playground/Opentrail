import { tokenProgramAt } from "@repo/solana";
import { z } from "zod";
import type { MintAuthorities, SolanaMints } from "./types";

const TIMEOUT_MS = 10_000;
// A Solana server returns at most this many accounts per call.
export const MAX_ACCOUNTS_PER_CALL = 100;

const AnswerSchema = z.union([
  z.object({ result: z.object({ value: z.array(z.unknown()) }) }),
  z.object({ error: z.object({ code: z.number() }) }),
]);

// A token mint, as the server writes it with jsonParsed. An authority is absent or null once
// revoked.
const MintAccountSchema = z.object({
  owner: z.string().refine((owner) => tokenProgramAt(owner) !== null),
  data: z.object({
    parsed: z.object({
      type: z.literal("mint"),
      info: z.object({
        mintAuthority: z.string().nullish(),
        freezeAuthority: z.string().nullish(),
      }),
    }),
  }),
});

export type SolanaOptions = {
  // A provider's address carries its key, so no error message shows it.
  rpcUrl: string;
  // Tests answer in place of the server.
  fetch?: (request: Request) => Promise<Response>;
};

export function createSolanaMints({ rpcUrl, fetch: send = fetch }: SolanaOptions): SolanaMints {
  async function getMultipleAccounts(mints: readonly string[]): Promise<unknown[]> {
    let response: Response;
    try {
      response = await send(
        new Request(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getMultipleAccounts",
            params: [mints, { encoding: "jsonParsed", commitment: "confirmed" }],
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        }),
      );
    } catch (error) {
      const name = error instanceof Error ? error.name : "Error";
      throw new Error(`The Solana server didn't answer (${name})`);
    }
    if (!response.ok) {
      throw new Error(`The Solana server answered ${response.status}`);
    }
    const parsed = AnswerSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error("The Solana server answered in a shape we don't know");
    }
    if ("error" in parsed.data) {
      throw new Error(`The Solana server answered error ${parsed.data.error.code}`);
    }
    return parsed.data.result.value;
  }

  return {
    async getAuthorities(mints) {
      const found = new Map<string, MintAuthorities>();
      for (let start = 0; start < mints.length; start += MAX_ACCOUNTS_PER_CALL) {
        const batch = mints.slice(start, start + MAX_ACCOUNTS_PER_CALL);
        const accounts = await getMultipleAccounts(batch);
        // The server answers in the order asked, with null for an account that doesn't exist.
        batch.forEach((mint, index) => {
          const account = MintAccountSchema.safeParse(accounts[index]);
          if (account.success) {
            const { mintAuthority, freezeAuthority } = account.data.data.parsed.info;
            found.set(mint, {
              mintAuthorityRevoked: mintAuthority == null,
              freezeAuthorityRevoked: freezeAuthority == null,
            });
          }
        });
      }
      return found;
    },
  };
}
