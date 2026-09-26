// The checks behind capture-tx.ts, kept apart so they can be tested without the network.

// A transaction signature: 64 bytes in base58.
export const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
// Lowercase words and dashes, so a name can't reach outside the fixtures folder.
const FIXTURE_NAME = /^[a-z0-9-]+$/;

// The fixture's file name: the name given, such as transfer-usdc, or else the signature.
// Null when either one isn't valid.
export function fixtureFileName(signature: string, name?: string): string | null {
  if (!SIGNATURE.test(signature)) {
    return null;
  }
  if (name === undefined) {
    return `${signature}.json`;
  }
  return FIXTURE_NAME.test(name) ? `${name}.json` : null;
}

// JSON numbers above 2^53 lose digits when read. Lamport balances are JSON numbers, so a fixture
// with such a number would silently differ from the chain: refuse it instead.
export function unsafeNumberPath(value: unknown, path = "$"): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) || !Number.isInteger(value) ? null : path;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = unsafeNumberPath(item, `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const found = unsafeNumberPath(item, `${path}.${key}`);
      if (found) return found;
    }
  }
  return null;
}
