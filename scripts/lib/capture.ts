// The checks behind capture-tx.ts, kept apart so they can be tested without the network.

// A transaction signature: 64 bytes in base58.
export const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

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
