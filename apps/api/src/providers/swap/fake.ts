// A swap provider for tests: routes are made up in memory, and nothing touches the network.
import { AccountRole, type Address, address, getAddressDecoder } from "@solana/kit";
import { type SwapProvider, SwapProviderError, type SwapRequest, type SwapRoute } from "./types";

// Stands in for the swap program; nothing is ever sent to it.
const FAKE_PROGRAM = address("SwapFake11111111111111111111111111111111111");

// A different, valid address for each number, so a test can make a route as wide as it likes.
const nthAddress = (n: number): Address => {
  const bytes = new Uint8Array(32);
  new DataView(bytes.buffer).setUint32(0, n + 1);
  return getAddressDecoder().decode(bytes);
};

export type FakeRouteOptions = Partial<Omit<SwapRoute, "parts">> & {
  // Accounts the swap instruction reads besides the wallet: more of them make a bigger transaction.
  extraAccounts?: number;
};

/** A route that gives one output unit per input unit, keeping the slippage as its minimum. */
export function fakeRoute(request: SwapRequest, options: FakeRouteOptions = {}): SwapRoute {
  const { extraAccounts = 0, ...overrides } = options;
  const accounts = [
    { address: address(request.userPublicKey), role: AccountRole.WRITABLE_SIGNER },
    ...Array.from({ length: extraAccounts }, (_, n) => ({
      address: nthAddress(n),
      role: AccountRole.WRITABLE,
    })),
  ];
  return {
    expectedOutRaw: request.amountRaw,
    minOutRaw: (request.amountRaw * BigInt(10_000 - request.slippageBps)) / 10_000n,
    priceImpactBps: 0,
    routeLabel: "Fake pool",
    providerFeeBps: 0,
    addressLookupTableAddresses: [],
    ...overrides,
    parts: {
      setup: [],
      swap: { programAddress: FAKE_PROGRAM, accounts, data: new Uint8Array([1]) },
      cleanup: [],
    },
  };
}

export type FakeSwapProvider = SwapProvider & {
  /** How the next calls answer: a route, or a SwapProviderError to throw. */
  respond(answer: (request: SwapRequest) => SwapRoute | SwapProviderError): void;
  /** Every request so far, in order. */
  readonly requests: readonly SwapRequest[];
};

export function createFakeSwapProvider(): FakeSwapProvider {
  const requests: SwapRequest[] = [];
  let answer: (request: SwapRequest) => SwapRoute | SwapProviderError = (request) =>
    fakeRoute(request);

  return {
    name: "fake",
    async getSwapInstructions(request) {
      requests.push(request);
      const result = answer(request);
      if (result instanceof SwapProviderError) {
        throw result;
      }
      return result;
    },
    respond: (next) => {
      answer = next;
    },
    requests,
  };
}
