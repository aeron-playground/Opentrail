import { createHash, timingSafeEqual } from "node:crypto";

// Compares in constant time, so response times reveal nothing about the secret. Hashing first
// gives both sides the same length, which timingSafeEqual needs, and hides the real length.
export function secretsMatch(given: string | undefined, expected: string): boolean {
  if (given === undefined) {
    return false;
  }
  return timingSafeEqual(sha256(given), sha256(expected));
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
