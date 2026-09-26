// What the indexer asks of Helius. Everything else about its API stays behind this type, so tests
// can swap in the fake.
export type HeliusWebhooks = {
  /**
   * Adds the addresses to our webhook's watch list; the ones it already watches stay. Resolves to
   * how many addresses the webhook watches afterwards.
   */
  addAddresses(addresses: string[]): Promise<number>;
};
