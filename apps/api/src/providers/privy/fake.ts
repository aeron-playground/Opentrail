// A Privy for tests: people and their tokens live in memory, and nothing touches the network.
import { getAddressDecoder } from "@solana/kit";
import type { PrivyProvider } from "./types";

// A made-up address: 32 random bytes, so a valid address that names no real wallet. (Random base58
// text of the right length usually decodes to 33 bytes, which no address check accepts.)
export function fakeSolanaAddress(): string {
  return getAddressDecoder().decode(crypto.getRandomValues(new Uint8Array(32)));
}

export type FakePerson = {
  privyDid: string;
  token: string;
  expiresAt: Date;
  // null until "Privy" creates the wallet.
  wallet: string | null;
};

export type FakePrivy = PrivyProvider & {
  /**
   * Signs a new person in. Pass `wallet: null` for someone whose wallet isn't created yet. The
   * token lasts an hour unless `expiresAt` says otherwise; like Privy, it's refused once expired.
   */
  signIn(options?: { wallet?: string | null; expiresAt?: Date }): FakePerson;
  /** A fresh token for someone already signed in, as when the app refreshes it. */
  refresh(privyDid: string, expiresAt: Date): string;
  /** Sets or clears a person's wallet, as Privy would once it creates one. */
  setWallet(privyDid: string, wallet: string | null): void;
  /** How many times the API asked for a wallet. */
  readonly walletReads: number;
  /** Makes the next wallet reads fail, as if Privy were down. */
  failWalletReads(error: Error | null): void;
};

export function createFakePrivy(): FakePrivy {
  const tokens = new Map<string, { privyDid: string; expiresAt: Date }>();
  const walletByDid = new Map<string, string | null>();
  let walletReads = 0;
  let walletError: Error | null = null;

  return {
    async verifyAccessToken(token) {
      const verified = tokens.get(token);
      return verified && verified.expiresAt.getTime() > Date.now() ? verified : null;
    },

    async getSolanaWallet(privyDid) {
      walletReads += 1;
      if (walletError) {
        throw walletError;
      }
      if (!walletByDid.has(privyDid)) {
        throw new Error(`Fake Privy has no user ${privyDid}`);
      }
      return walletByDid.get(privyDid) ?? null;
    },

    signIn({
      wallet = fakeSolanaAddress(),
      expiresAt = new Date(Date.now() + 60 * 60 * 1000),
    } = {}) {
      const person = {
        privyDid: `did:privy:${crypto.randomUUID()}`,
        token: `fake-token-${crypto.randomUUID()}`,
        expiresAt,
        wallet,
      };
      tokens.set(person.token, { privyDid: person.privyDid, expiresAt });
      walletByDid.set(person.privyDid, wallet);
      return person;
    },

    refresh(privyDid, expiresAt) {
      const token = `fake-token-${crypto.randomUUID()}`;
      tokens.set(token, { privyDid, expiresAt });
      return token;
    },

    setWallet(privyDid, wallet) {
      walletByDid.set(privyDid, wallet);
    },

    get walletReads() {
      return walletReads;
    },

    failWalletReads(error) {
      walletError = error;
    },
  };
}
