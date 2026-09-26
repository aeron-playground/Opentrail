// A Helius for tests: the watch list lives in memory, and nothing touches the network.
import type { HeliusWebhooks } from "./types";

export type FakeHelius = HeliusWebhooks & {
  readonly addresses: ReadonlySet<string>;
  /** Makes the next calls fail, as if Helius were down; null makes them work again. */
  failWith(error: Error | null): void;
};

export function createFakeHelius(): FakeHelius {
  const addresses = new Set<string>();
  let failure: Error | null = null;
  return {
    async addAddresses(added) {
      if (failure) {
        throw failure;
      }
      for (const address of added) {
        addresses.add(address);
      }
      return addresses.size;
    },
    addresses,
    failWith(error) {
      failure = error;
    },
  };
}
