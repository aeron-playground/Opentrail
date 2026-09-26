import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type DbHandle, users } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { AppError, createLogger } from "@repo/server";
import { USERNAME_PATTERN } from "@repo/shared";
import { createFakePrivy, type FakePrivy, fakeSolanaAddress } from "../providers/privy/fake";
import { capturedLogger, namesInOrder } from "../testing";
import { createUserService } from "./users";

let database: DbHandle;
let privy: FakePrivy;

beforeAll(async () => {
  database = await createTestDb("api");
});

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.db.delete(users);
  privy = createFakePrivy();
});

function service(options: { nextUsername?: () => string } = {}) {
  return createUserService({
    db: database.db,
    privy,
    logger: createLogger("silent"),
    ...options,
  });
}

const allUsers = () => database.db.query.users.findMany();

async function insertOtherUser(values: { username?: string; walletAddress?: string } = {}) {
  await database.db.insert(users).values({
    privyDid: `did:privy:${crypto.randomUUID()}`,
    walletAddress: values.walletAddress ?? fakeSolanaAddress(),
    username: values.username ?? "other_person",
  });
}

describe("getOrCreate", () => {
  test("creates the account on the first visit, with the wallet from Privy", async () => {
    const person = privy.signIn();
    const { logger, lines } = capturedLogger();
    const user = await createUserService({ db: database.db, privy, logger }).getOrCreate(
      person.privyDid,
    );

    expect(user.privyDid).toBe(person.privyDid);
    expect(user.walletAddress).toBe(String(person.wallet));
    expect(user.username).toMatch(USERNAME_PATTERN);
    expect(user.usernameChangedAt).toBeNull();
    expect(await allUsers()).toHaveLength(1);
    expect(lines.find((line) => line.msg === "user created")).toMatchObject({ userId: user.id });
  });

  test("returns the same account later, without asking Privy again", async () => {
    const person = privy.signIn();
    const first = await service().getOrCreate(person.privyDid);
    const second = await service().getOrCreate(person.privyDid);

    expect(second).toEqual(first);
    expect(privy.walletReads).toBe(1);
  });

  test("keeps each person's account apart", async () => {
    const maya = privy.signIn();
    const kiran = privy.signIn();
    const a = await service().getOrCreate(maya.privyDid);
    const b = await service().getOrCreate(kiran.privyDid);

    expect(a.id).not.toBe(b.id);
    expect(b.walletAddress).toBe(String(kiran.wallet));
  });

  test("says the wallet isn't ready, and creates nothing, until Privy has made it", async () => {
    const person = privy.signIn({ wallet: null });
    const error = await service()
      .getOrCreate(person.privyDid)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("WALLET_NOT_READY");
    expect(await allUsers()).toHaveLength(0);

    const wallet = fakeSolanaAddress();
    privy.setWallet(person.privyDid, wallet);
    expect((await service().getOrCreate(person.privyDid)).walletAddress).toBe(wallet);
  });

  test("creates one account when two first visits arrive together", async () => {
    const person = privy.signIn();
    const [a, b] = await Promise.all([
      service().getOrCreate(person.privyDid),
      service().getOrCreate(person.privyDid),
    ]);

    expect(a.id).toBe(b.id);
    expect(await allUsers()).toHaveLength(1);
  });

  test("tries another username when the random one is taken", async () => {
    await insertOtherUser({ username: "calm_otter_42" });
    const person = privy.signIn();
    const user = await service({
      nextUsername: namesInOrder("calm_otter_42", "brave_heron_07"),
    }).getOrCreate(person.privyDid);

    expect(user.username).toBe("brave_heron_07");
  });

  test("treats a name that differs only in case as taken", async () => {
    await insertOtherUser({ username: "calm_otter_42" });
    const person = privy.signIn();
    const user = await service({
      nextUsername: namesInOrder("Calm_Otter_42", "brave_heron_07"),
    }).getOrCreate(person.privyDid);

    expect(user.username).toBe("brave_heron_07");
  });

  test("gives up after five taken usernames and creates nothing", async () => {
    await insertOtherUser({ username: "calm_otter_42" });
    const person = privy.signIn();
    const names = Array.from({ length: 6 }, () => "calm_otter_42");

    await expect(
      service({ nextUsername: namesInOrder(...names) }).getOrCreate(person.privyDid),
    ).rejects.toThrow("No free username after 5 tries");
    expect(await allUsers()).toHaveLength(1);
  });

  test("refuses a wallet that already belongs to another account", async () => {
    const wallet = fakeSolanaAddress();
    await insertOtherUser({ walletAddress: wallet });
    const person = privy.signIn({ wallet });

    await expect(service().getOrCreate(person.privyDid)).rejects.toThrow(
      "The wallet already belongs to user",
    );
    expect(await allUsers()).toHaveLength(1);
  });

  test("passes a Privy failure on and creates nothing", async () => {
    const person = privy.signIn();
    privy.failWalletReads(new Error("Privy is down"));

    await expect(service().getOrCreate(person.privyDid)).rejects.toThrow("Privy is down");
    expect(await allUsers()).toHaveLength(0);
  });
});
