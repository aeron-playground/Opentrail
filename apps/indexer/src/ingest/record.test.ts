import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { BALANCE_CHANGED_CHANNEL, type DbHandle, transfers, users } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { SOL, USDC } from "@repo/solana";
import { sql } from "drizzle-orm";
import { insertUser, loadFixture } from "../testing";
import { normalizeRpcTransaction } from "./normalize-rpc";
import { recordTransaction } from "./record";

// Real mainnet accounts from the fixtures (public data). The users owning them are made up.
const USDC_SENDER = "2yhXwyfiELyF336sY6JTWcPxGb3MFuFsQmZbXA6W2upZ";
const USDC_RECEIVER = "7uTT8Xi5RWXzy7h9XL244GRgEycDYDhLjr3ZyNdXi8pZ";
const SOL_SENDER = "AxiomRXZAq1Jgjj9pHmNqVP7Lhu67wLXZJZbaK87TTSk";
const SOL_RECEIVER = "CaSoKH6ivzKpV5rZ2WHrhwAesDiVktA9FNADSNrpFJj2";

let handle: DbHandle;
let notified: string[];
let marker: PromiseWithResolvers<void>;

beforeAll(async () => {
  handle = await createTestDb("indexer");
  await handle.listen(BALANCE_CHANGED_CHANNEL, (payload) => {
    if (payload === "marker") {
      marker.resolve();
    } else {
      notified.push(payload);
    }
  });
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.delete(transfers);
  await handle.db.delete(users);
  notified = [];
  marker = Promise.withResolvers();
});

// Notifications arrive in order, so once the marker is in, every earlier one is too.
async function notificationsSoFar(): Promise<string[]> {
  await handle.db.execute(sql`select pg_notify(${BALANCE_CHANGED_CHANNEL}, 'marker')`);
  await marker.promise;
  return notified;
}

async function record(fixture: string) {
  const normalized = normalizeRpcTransaction(await loadFixture(fixture));
  return handle.db.transaction((tx) => recordTransaction(tx, normalized));
}

describe("recordTransaction", () => {
  test("saves a USDC deposit, worth its amount in micro-USDC, and tells the receiver", async () => {
    const receiver = await insertUser(handle.db, USDC_RECEIVER);

    expect(await record("transfer-usdc")).toEqual({ deposits: 1, usersNotified: 1 });

    expect(await handle.db.select().from(transfers)).toEqual([
      {
        id: expect.any(String),
        userId: receiver,
        walletAddress: USDC_RECEIVER,
        signature:
          "3AeyuLVPMr53xVWnf1jLsnFCCAtRTUBCtF9yQMAK5iTTxBXZAXeg345HnGutQs6asRs7d1d9BaQrjnsH71ZAUrs4",
        slot: 450_787_941n,
        blockTime: new Date(1_790_456_075_000),
        direction: "in",
        mint: USDC.mint,
        amountRaw: 50_000_000n,
        counterparty: USDC_SENDER,
        kind: "deposit",
        usdValueMicro: 50_000_000n,
        createdAt: expect.any(Date),
      },
    ]);
    expect(await notificationsSoFar()).toEqual([receiver]);
  });

  test("saves a SOL deposit with no dollar value yet", async () => {
    await insertUser(handle.db, SOL_RECEIVER);

    await record("transfer-sol");

    expect(await handle.db.select().from(transfers)).toMatchObject([
      { mint: SOL.mint, amountRaw: 9_402_371n, counterparty: SOL_SENDER, usdValueMicro: null },
    ]);
  });

  test("saves a transaction seen twice once, and says so", async () => {
    await insertUser(handle.db, USDC_RECEIVER);

    await record("transfer-usdc");
    expect(await record("transfer-usdc")).toEqual({ deposits: 0, usersNotified: 1 });
    expect(await handle.db.$count(transfers)).toBe(1);
  });

  test("tells a sender their balance changed, without saving a deposit", async () => {
    const sender = await insertUser(handle.db, USDC_SENDER);

    expect(await record("transfer-usdc")).toEqual({ deposits: 0, usersNotified: 1 });
    expect(await handle.db.$count(transfers)).toBe(0);
    expect(await notificationsSoFar()).toEqual([sender]);
  });

  test("does nothing for a transaction none of our users took part in", async () => {
    await insertUser(handle.db, SOL_RECEIVER);

    expect(await record("transfer-usdc")).toEqual({ deposits: 0, usersNotified: 0 });
    expect(await notificationsSoFar()).toEqual([]);
  });

  test("does nothing for a transaction that moved nothing", async () => {
    const normalized = normalizeRpcTransaction(await loadFixture("version-1"));
    const unchanged = { ...normalized, solDeltas: [], tokenDeltas: [] };

    expect(await handle.db.transaction((tx) => recordTransaction(tx, unchanged))).toEqual({
      deposits: 0,
      usersNotified: 0,
    });
  });

  test("keeps nothing and sends nothing when the transaction rolls back", async () => {
    await insertUser(handle.db, USDC_RECEIVER);
    const normalized = normalizeRpcTransaction(await loadFixture("transfer-usdc"));

    const rolledBack = handle.db.transaction(async (tx) => {
      await recordTransaction(tx, normalized);
      throw new Error("something after it broke");
    });

    await expect(rolledBack).rejects.toThrow("something after it broke");
    expect(await handle.db.$count(transfers)).toBe(0);
    expect(await notificationsSoFar()).toEqual([]);
  });
});
