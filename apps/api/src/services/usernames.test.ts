import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type DbHandle, type NewUser, type User, users } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { AppError } from "@repo/server";
import { USERNAME_PATTERN } from "@repo/shared";
import { fakeSolanaAddress } from "../providers/privy/fake";
import { namesInOrder } from "../testing";
import { createUsernameService } from "./usernames";

const DAY_MS = 24 * 60 * 60 * 1000;
const START = new Date("2026-09-26T10:00:00.000Z");

let database: DbHandle;
let clock: Date;

beforeAll(async () => {
  database = await createTestDb("api");
});

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.db.delete(users);
  clock = START;
});

function service(options: { nextUsername?: () => string } = {}) {
  return createUsernameService({ db: database.db, now: () => clock, ...options });
}

async function insertUser(values: Partial<NewUser> = {}): Promise<User> {
  const [user] = await database.db
    .insert(users)
    .values({
      privyDid: `did:privy:${crypto.randomUUID()}`,
      walletAddress: fakeSolanaAddress(),
      username: `user_${crypto.randomUUID().slice(0, 8)}`,
      ...values,
    })
    .returning();
  if (!user) throw new Error("insert returned no row");
  return user;
}

const reload = async (user: User) =>
  database.db.query.users.findFirst({ where: (row, { eq }) => eq(row.id, user.id) });

async function appErrorOf(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  if (!(error instanceof AppError)) throw new Error(`Expected an AppError, got ${String(error)}`);
  return error;
}

// The error code of the one request that failed, from a set run at the same time.
function rejectedCode(results: PromiseSettledResult<unknown>[]): string | undefined {
  const rejected = results.find((result) => result.status === "rejected");
  return rejected?.status === "rejected" && rejected.reason instanceof AppError
    ? rejected.reason.code
    : undefined;
}

describe("availability", () => {
  test("says a free name is available, in any case", async () => {
    expect(await service().availability("Maya")).toEqual({ available: true });
  });

  test("says a name someone has is taken, whatever the case", async () => {
    await insertUser({ username: "maya" });
    expect(await service().availability("MAYA")).toEqual({ available: false, reason: "taken" });
  });

  test.each([
    ["admin", "reserved"],
    ["adm1n", "reserved"],
    ["ab", "invalid"],
    ["maya k", "invalid"],
  ] as const)("says %s is %s", async (name, reason) => {
    expect(await service().availability(name)).toEqual({ available: false, reason });
  });
});

describe("suggest", () => {
  test("suggests a name that fits the rules", async () => {
    expect(await service().suggest()).toMatch(USERNAME_PATTERN);
  });

  test("skips names that are taken", async () => {
    await insertUser({ username: "calm_otter_42" });
    const names = namesInOrder(
      "calm_otter_42",
      "brave_heron_07",
      "keen_lynx_11",
      "bold_fox_20",
      "wise_owl_33",
    );
    expect(await service({ nextUsername: names }).suggest()).toBe("brave_heron_07");
  });

  test("gives up when every candidate is taken", async () => {
    await insertUser({ username: "calm_otter_42" });
    const names = namesInOrder(...Array.from({ length: 5 }, () => "calm_otter_42"));
    await expect(service({ nextUsername: names }).suggest()).rejects.toThrow("were taken");
  });
});

describe("change", () => {
  test("gives the person the new name, saved in lowercase, and starts the wait", async () => {
    const user = await insertUser();
    const changed = await service().change(user, "Maya_K");

    expect(changed.username).toBe("maya_k");
    expect(changed.usernameChangedAt).toEqual(START);
    expect(service().changeableAt(changed)).toEqual(new Date(START.getTime() + 30 * DAY_MS));
  });

  test("keeping the suggested name confirms it and starts the wait", async () => {
    const user = await insertUser({ username: "calm_otter_42" });
    const confirmed = await service().change(user, "calm_otter_42");

    expect(confirmed.username).toBe("calm_otter_42");
    expect(confirmed.usernameChangedAt).toEqual(START);
  });

  test("confirming a name that's already chosen changes nothing", async () => {
    const chosenAt = new Date(START.getTime() - 5 * DAY_MS);
    const user = await insertUser({ username: "maya", usernameChangedAt: chosenAt });
    const again = await service().change(user, "maya");

    expect(again.usernameChangedAt).toEqual(chosenAt);
    expect((await reload(user))?.usernameChangedAt).toEqual(chosenAt);
  });

  test("refuses a second change within 30 days, with the time left", async () => {
    const chosenAt = new Date(START.getTime() - 10 * DAY_MS);
    const user = await insertUser({ username: "maya", usernameChangedAt: chosenAt });
    const error = await appErrorOf(service().change(user, "kiran"));

    expect(error.code).toBe("USERNAME_CHANGE_TOO_SOON");
    expect(error.retryAfterSeconds).toBe((20 * DAY_MS) / 1000);
    expect((await reload(user))?.username).toBe("maya");
  });

  test("allows the next change once 30 days have passed", async () => {
    const user = await insertUser({
      username: "maya",
      usernameChangedAt: new Date(START.getTime() - 30 * DAY_MS),
    });
    expect((await service().change(user, "kiran")).username).toBe("kiran");
  });

  test("refuses a name someone else has, whatever the case", async () => {
    await insertUser({ username: "maya" });
    const user = await insertUser();
    expect((await appErrorOf(service().change(user, "MAYA"))).code).toBe("USERNAME_TAKEN");
    expect((await reload(user))?.usernameChangedAt).toBeNull();
  });

  test.each([
    ["support", "USERNAME_RESERVED"],
    ["supp0rt", "USERNAME_RESERVED"],
    ["no spaces", "VALIDATION_FAILED"],
    ["x", "VALIDATION_FAILED"],
  ] as const)("refuses %s with %s", async (name, code) => {
    const user = await insertUser();
    expect((await appErrorOf(service().change(user, name))).code).toBe(code);
    expect((await reload(user))?.username).toBe(user.username);
  });

  test("gives a name to only one of two people asking at once", async () => {
    const [a, b] = [await insertUser(), await insertUser()];
    const results = await Promise.allSettled([
      service().change(a, "maya"),
      service().change(b, "maya"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(rejectedCode(results)).toBe("USERNAME_TAKEN");
  });

  test("lets only one of two changes sent at once through", async () => {
    const user = await insertUser();
    const results = await Promise.allSettled([
      service().change(user, "maya"),
      service().change(user, "kiran"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(rejectedCode(results)).toBe("USERNAME_CHANGE_TOO_SOON");
  });
});

describe("changeableAt", () => {
  test("is null for a name that was never chosen", async () => {
    expect(service().changeableAt(await insertUser())).toBeNull();
  });

  test("is null once the wait is over", async () => {
    const user = await insertUser({ usernameChangedAt: new Date(START.getTime() - 31 * DAY_MS) });
    expect(service().changeableAt(user)).toBeNull();
  });
});
