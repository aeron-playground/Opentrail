// Helpers for this app's tests. Never import this from app code.
import { join } from "node:path";
import { type Database, users } from "@repo/db";
import { createLogger, type Logger } from "@repo/server";
import type { Inbox } from "./inbox";

// Long enough for the settings check. Used only by tests.
export const TEST_WEBHOOK_SECRET = "test-webhook-secret-that-is-long-enough";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// A logger that keeps its lines in memory, so tests can check what was logged.
export function capturedLogger(): { logger: Logger; lines: Record<string, unknown>[] } {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger("debug", {
    write: (line) => {
      lines.push(JSON.parse(line));
    },
  });
  return { logger, lines };
}

// A made-up signature in the right format (88 base58 characters). It names no real transaction.
export function fakeSignature(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(88)), (byte) =>
    BASE58.charAt(byte % BASE58.length),
  ).join("");
}

// The shape of one transaction in a Helius raw webhook delivery, with made-up content.
export function fakeRawTransaction(signature = fakeSignature()) {
  return {
    slot: 1,
    blockTime: 1_700_000_000,
    transaction: { signatures: [signature], message: { accountKeys: [], instructions: [] } },
    meta: { err: null, fee: 5000, preBalances: [], postBalances: [] },
  };
}

// An inbox without a database, for tests that don't need one.
export function fakeInbox(overrides: Partial<Inbox> = {}): Inbox {
  return {
    save: async (_provider, events) => events.length,
    nextPending: async () => [],
    complete: async () => true,
    fail: async () => 1,
    stats: async () => ({ pending: 0, oldestPendingSeconds: null, setAside: 0 }),
    deleteProcessedBefore: async () => 0,
    ...overrides,
  };
}

// A real mainnet transaction from test/fixtures, as Helius would deliver it.
export async function loadFixture(name: string): Promise<Record<string, unknown>> {
  return Bun.file(join(import.meta.dir, "..", "test", "fixtures", `${name}.json`)).json();
}

// A user who owns `walletAddress`, with made-up sign-in details. Resolves to the user's id.
export async function insertUser(db: Database, walletAddress: string): Promise<string> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const [user] = await db
    .insert(users)
    .values({ privyDid: `did:privy:test-${suffix}`, walletAddress, username: `test_${suffix}` })
    .returning({ id: users.id });
  if (user === undefined) {
    throw new Error("The test user wasn't saved");
  }
  return user.id;
}
