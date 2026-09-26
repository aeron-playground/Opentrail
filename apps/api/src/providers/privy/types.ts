// The parts of Privy the API uses. Everything else about Privy stays behind this type, so the
// rest of the API never imports Privy's SDK and tests can swap in the fake.
export type PrivyProvider = {
  /**
   * Checks a Privy access token: signature, issuer, audience (our app id) and expiry.
   * Resolves to the person's Privy user id, or null when the token isn't valid.
   */
  verifyAccessToken(token: string): Promise<string | null>;
  /**
   * Reads the person's embedded Solana wallet from Privy. Resolves to its address, or null
   * when Privy hasn't created the wallet yet.
   */
  getSolanaWallet(privyDid: string): Promise<string | null>;
};
