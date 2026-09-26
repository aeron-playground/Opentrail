// Accounts: finding the signed-in person, and creating their account on the first visit.
import { type Database, type User, users } from "@repo/db";
import { AppError, type Logger } from "@repo/server";
import { randomUsername } from "@repo/shared";
import type { PrivyProvider } from "../providers/privy/types";

export type UserService = {
  /** The person's account, created on their first visit. */
  getOrCreate(privyDid: string): Promise<User>;
};

export type UserServiceDeps = {
  db: Database;
  privy: Pick<PrivyProvider, "getSolanaWallet">;
  logger: Logger;
  // Tests pass their own names to force clashes.
  nextUsername?: () => string;
};

// Two random names clash about once in 300,000 tries, so running out of tries means
// something else is wrong.
const MAX_USERNAME_TRIES = 5;

export function createUserService({
  db,
  privy,
  logger,
  nextUsername = randomUsername,
}: UserServiceDeps): UserService {
  const findByPrivyDid = (privyDid: string) =>
    db.query.users.findFirst({ where: (user, { eq }) => eq(user.privyDid, privyDid) });

  return {
    async getOrCreate(privyDid) {
      const existing = await findByPrivyDid(privyDid);
      if (existing) {
        return existing;
      }

      // Only from Privy, on the server: an address sent by the client could be anyone's wallet.
      const walletAddress = await privy.getSolanaWallet(privyDid);
      if (walletAddress === null) {
        throw new AppError("WALLET_NOT_READY");
      }

      for (let tries = 0; tries < MAX_USERNAME_TRIES; tries += 1) {
        const [created] = await db
          .insert(users)
          .values({ privyDid, walletAddress, username: nextUsername() })
          .onConflictDoNothing()
          .returning();
        if (created) {
          logger.info({ userId: created.id }, "user created");
          return created;
        }

        // Two first requests can race; the one that lost finds the account the other created.
        const raced = await findByPrivyDid(privyDid);
        if (raced) {
          return raced;
        }
        const walletOwner = await db.query.users.findFirst({
          columns: { id: true },
          where: (user, { eq }) => eq(user.walletAddress, walletAddress),
        });
        if (walletOwner) {
          throw new Error(`The wallet already belongs to user ${walletOwner.id}`);
        }
        // Only the username clashed, so try another one.
      }
      throw new Error(`No free username after ${MAX_USERNAME_TRIES} tries`);
    },
  };
}
