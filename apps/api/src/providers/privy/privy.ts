import { InvalidAuthTokenError, PrivyClient } from "@privy-io/node";
import { z } from "zod";
import type { PrivyProvider } from "./types";

// Set here, so the SDK never falls back to its own environment variables (PRIVY_API_BASE_URL,
// PRIVY_API_LOG): settings are read only in env.ts.
export const PRIVY_API_URL = "https://api.privy.io";

// A person waits on these calls, so fail fast rather than use the SDK's one minute and two retries.
const TIMEOUT_MS = 5_000;
const MAX_RETRIES = 1;

// Base58, 32 to 44 characters: the shape of a Solana address.
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type PrivyOptions = {
  appId: string;
  appSecret: string;
  // Privy's public key for access tokens. Without it, the SDK fetches the key set from Privy
  // and caches it for an hour. Tests pass one so they need no network.
  verificationKey?: string;
  // Tests answer in place of Privy's API.
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
};

export function createPrivy({
  appId,
  appSecret,
  verificationKey,
  fetch,
}: PrivyOptions): PrivyProvider {
  const client = new PrivyClient({
    appId,
    appSecret,
    apiUrl: PRIVY_API_URL,
    jwtVerificationKey: verificationKey,
    timeout: TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
    // Failures reach our own logs as thrown errors; the SDK would write to the console.
    logLevel: "off",
    fetch,
  });

  return {
    async verifyAccessToken(token) {
      try {
        const { user_id } = await client.utils().auth().verifyAccessToken(token);
        return user_id;
      } catch (error) {
        if (error instanceof InvalidAuthTokenError) {
          return null;
        }
        throw error;
      }
    },

    async getSolanaWallet(privyDid) {
      return embeddedSolanaWallet(await client.users()._get(privyDid));
    },
  };
}

const PrivyUserSchema = z.object({ linked_accounts: z.array(z.unknown()) });

// Picks out wallets Privy created for the person on Solana; external wallets such as Phantom
// are also linked accounts of type "wallet", but the person holds those keys elsewhere.
const EmbeddedSolanaSchema = z.object({
  type: z.literal("wallet"),
  chain_type: z.literal("solana"),
  connector_type: z.literal("embedded"),
});

const EmbeddedSolanaWalletSchema = z.object({
  address: z.string().regex(SOLANA_ADDRESS),
  wallet_client_type: z.literal("privy"),
  wallet_index: z.number().int().nonnegative(),
});

/**
 * The address of the person's first embedded Solana wallet, or null when there is none yet.
 * Throws when Privy's answer doesn't have the expected shape.
 */
export function embeddedSolanaWallet(user: unknown): string | null {
  const wallets = PrivyUserSchema.parse(user)
    .linked_accounts.filter((account) => EmbeddedSolanaSchema.safeParse(account).success)
    .map((account) => EmbeddedSolanaWalletSchema.parse(account))
    .sort((a, b) => a.wallet_index - b.wallet_index);
  return wallets[0]?.address ?? null;
}
