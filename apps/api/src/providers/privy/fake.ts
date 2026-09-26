// A Privy for tests: people and their tokens live in memory, and nothing touches the network.
import type { PrivyProvider } from "./types";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// A made-up address in the right format (44 base58 characters). It names no real wallet.
export function fakeSolanaAddress(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(44)), (byte) =>
    BASE58.charAt(byte % BASE58.length),
  ).join("");
}

export type FakePerson = {
  privyDid: string;
  token: string;
  // null until "Privy" creates the wallet.
  wallet: string | null;
};

export type FakePrivy = PrivyProvider & {
  /** Signs a new person in. Pass `wallet: null` for someone whose wallet isn't created yet. */
  signIn(options?: { wallet?: string | null }): FakePerson;
  /** Sets or clears a person's wallet, as Privy would once it creates one. */
  setWallet(privyDid: string, wallet: string | null): void;
  /** How many times the API asked for a wallet. */
  readonly walletReads: number;
  /** Makes the next wallet reads fail, as if Privy were down. */
  failWalletReads(error: Error | null): void;
};

export function createFakePrivy(): FakePrivy {
  const didByToken = new Map<string, string>();
  const walletByDid = new Map<string, string | null>();
  let walletReads = 0;
  let walletError: Error | null = null;

  return {
    async verifyAccessToken(token) {
      return didByToken.get(token) ?? null;
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

    signIn({ wallet = fakeSolanaAddress() } = {}) {
      const person = {
        privyDid: `did:privy:${crypto.randomUUID()}`,
        token: `fake-token-${crypto.randomUUID()}`,
        wallet,
      };
      didByToken.set(person.token, person.privyDid);
      walletByDid.set(person.privyDid, wallet);
      return person;
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
