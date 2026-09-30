// What the indexer asks of a Solana server. Everything else about its API stays behind this
// type, so tests can swap in the fake.
export type MintAuthorities = {
  // No one can create more of the token.
  mintAuthorityRevoked: boolean;
  // No one can freeze a holder's tokens.
  freezeAuthorityRevoked: boolean;
};

export type SolanaMints = {
  /** Each mint's authorities, read from the chain. An account that isn't a token mint is left out. */
  getAuthorities(mints: readonly string[]): Promise<Map<string, MintAuthorities>>;
};
