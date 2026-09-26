// Usernames: suggestions, availability, and changing your own.
import { type Database, postgresErrorCode, UNIQUE_VIOLATION, type User, users } from "@repo/db";
import { AppError } from "@repo/server";
import {
  normalizeUsername,
  randomUsername,
  USERNAME_CHANGE_DAYS,
  type UsernameProblem,
  usernameProblem,
} from "@repo/shared";
import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";

const DAY_MS = 24 * 60 * 60 * 1000;
const CHANGE_WAIT_MS = USERNAME_CHANGE_DAYS * DAY_MS;

// Random names clash about once in 300,000, so five candidates always leave a free one.
const SUGGESTION_CANDIDATES = 5;

export type UsernameAvailability =
  | { available: true }
  | { available: false; reason: UsernameProblem | "taken" };

export type UsernameService = {
  /** Whether anyone could take this name right now. */
  availability(name: string): Promise<UsernameAvailability>;
  /** A random name that nobody has. */
  suggest(): Promise<string>;
  /**
   * Gives the person a new name, or confirms the one they have. Either counts as their change
   * for the next USERNAME_CHANGE_DAYS days; confirming a name that's already confirmed changes
   * nothing.
   */
  change(user: User, name: string): Promise<User>;
  /** When the person may change their name again, or null when they may change it now. */
  changeableAt(user: User): Date | null;
};

export type UsernameServiceDeps = {
  db: Database;
  // Tests pass a fixed clock, and their own names to force clashes.
  now?: () => Date;
  nextUsername?: () => string;
};

export function createUsernameService({
  db,
  now = () => new Date(),
  nextUsername = randomUsername,
}: UsernameServiceDeps): UsernameService {
  const findById = async (id: string): Promise<User> => {
    const user = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!user) {
      throw new Error(`User ${id} no longer exists`);
    }
    return user;
  };

  const changeableAt = (user: User): Date | null => {
    if (user.usernameChangedAt === null) {
      return null;
    }
    const next = new Date(user.usernameChangedAt.getTime() + CHANGE_WAIT_MS);
    return next > now() ? next : null;
  };

  return {
    async availability(name) {
      const username = normalizeUsername(name);
      const problem = usernameProblem(username);
      if (problem !== null) {
        return { available: false, reason: problem };
      }
      const owner = await db.query.users.findFirst({
        columns: { id: true },
        where: eq(users.username, username),
      });
      return owner ? { available: false, reason: "taken" } : { available: true };
    },

    async suggest() {
      const candidates = Array.from({ length: SUGGESTION_CANDIDATES }, nextUsername).filter(
        (name) => usernameProblem(name) === null,
      );
      const taken = new Set(
        (
          await db.query.users.findMany({
            columns: { username: true },
            where: inArray(users.username, candidates),
          })
        ).map((user) => user.username.toLowerCase()),
      );
      const free = candidates.find((name) => !taken.has(name));
      if (free === undefined) {
        throw new Error(`All ${SUGGESTION_CANDIDATES} username candidates were taken`);
      }
      return free;
    },

    async change(user, name) {
      const username = normalizeUsername(name);
      const problem = usernameProblem(username);
      if (problem === "invalid") {
        throw new AppError("VALIDATION_FAILED");
      }
      if (problem === "reserved") {
        throw new AppError("USERNAME_RESERVED");
      }
      const at = now();

      if (username === user.username.toLowerCase()) {
        if (user.usernameChangedAt !== null) {
          return user;
        }
        // Keeping the suggested name during onboarding: it becomes the person's choice.
        const [confirmed] = await db
          .update(users)
          .set({ usernameChangedAt: at })
          .where(and(eq(users.id, user.id), isNull(users.usernameChangedAt)))
          .returning();
        return confirmed ?? findById(user.id);
      }

      // The wait is part of the update, so two changes sent at once can't both pass it.
      let changed: User | undefined;
      try {
        [changed] = await db
          .update(users)
          .set({ username, usernameChangedAt: at })
          .where(
            and(
              eq(users.id, user.id),
              or(
                isNull(users.usernameChangedAt),
                lte(users.usernameChangedAt, new Date(at.getTime() - CHANGE_WAIT_MS)),
              ),
            ),
          )
          .returning();
      } catch (error) {
        if (postgresErrorCode(error) === UNIQUE_VIOLATION) {
          throw new AppError("USERNAME_TAKEN", { cause: error });
        }
        throw error;
      }
      if (changed) {
        return changed;
      }

      const next = changeableAt(await findById(user.id));
      throw new AppError("USERNAME_CHANGE_TOO_SOON", {
        retryAfterSeconds: next === null ? 1 : (next.getTime() - at.getTime()) / 1000,
      });
    },

    changeableAt,
  };
}
