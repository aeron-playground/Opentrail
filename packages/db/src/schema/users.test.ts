import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import type { DbHandle } from "../client";
import { createTestDb, postgresErrorCode } from "../testing";
import { type NewUser, users } from "./users";

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let handle: DbHandle;

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.delete(users);
});

function newUser(overrides: Partial<NewUser> = {}): NewUser {
  return {
    privyDid: `did:privy:${crypto.randomUUID()}`,
    walletAddress: crypto.randomUUID(),
    username: `user_${crypto.randomUUID().slice(0, 8)}`,
    ...overrides,
  };
}

async function insertError(user: NewUser): Promise<string | undefined> {
  try {
    await handle.db.insert(users).values(user);
    return undefined;
  } catch (error) {
    return postgresErrorCode(error);
  }
}

describe("users", () => {
  test("new users get a UUIDv7 id, active status and timestamps", async () => {
    const [user] = await handle.db.insert(users).values(newUser()).returning();

    expect(user?.id).toMatch(UUID_V7);
    expect(user?.status).toBe("active");
    expect(user?.createdAt).toBeInstanceOf(Date);
    expect(user?.updatedAt).toBeInstanceOf(Date);
    expect(user?.deletedAt).toBeNull();
  });

  test("usernames are unique regardless of case", async () => {
    await handle.db.insert(users).values(newUser({ username: "Maya" }));

    expect(await insertError(newUser({ username: "maya" }))).toBe(UNIQUE_VIOLATION);
    const [found] = await handle.db.select().from(users).where(eq(users.username, "MAYA"));
    expect(found?.username).toBe("Maya");
  });

  const uniqueFields: { field: "privyDid" | "walletAddress"; value: string }[] = [
    { field: "privyDid", value: "did:privy:same" },
    { field: "walletAddress", value: "SameWalletAddress111111111111111111111111111" },
  ];

  for (const { field, value } of uniqueFields) {
    test(`${field} is unique`, async () => {
      await handle.db.insert(users).values(newUser({ [field]: value }));
      expect(await insertError(newUser({ [field]: value }))).toBe(UNIQUE_VIOLATION);
    });
  }

  test("status only accepts known values", async () => {
    const user = newUser();
    let code: string | undefined;
    try {
      await handle.db.execute(sql`
        insert into users (id, privy_did, wallet_address, username, status)
        values (${Bun.randomUUIDv7()}, ${user.privyDid}, ${user.walletAddress}, ${user.username}, 'frozen')
      `);
    } catch (error) {
      code = postgresErrorCode(error);
    }
    expect(code).toBe(CHECK_VIOLATION);
  });

  test("updated_at moves forward on update", async () => {
    const [created] = await handle.db.insert(users).values(newUser()).returning();
    if (!created) throw new Error("insert returned no row");

    await Bun.sleep(5);
    const [updated] = await handle.db
      .update(users)
      .set({ status: "banned" })
      .where(eq(users.id, created.id))
      .returning();

    expect(updated?.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
  });
});
