import { and, eq, inArray, not, sql } from "drizzle-orm";
import type { Database } from "../client";
import { type NewToken, tokens } from "../schema/tokens";
import { seedTokenRows } from "./tokens";

// In an upsert, Postgres calls the row that was about to be inserted `excluded`.
const excluded = (column: { name: string }) => sql.raw(`excluded."${column.name}"`);

// Loads the curated list into the tokens table, and can run again safely. It sets what the list
// says, including the reviewed safety notes, and leaves the market-data columns to their jobs. A listed token that left the list is
// unlisted, never deleted: other tables may name it. Resolves to how many tokens it saved.
export async function seedTokens(
  db: Database,
  rows: NewToken[] = seedTokenRows(),
): Promise<number> {
  const listed = rows.filter((row) => row.isListed).map((row) => row.mint);
  return db.transaction(async (tx) => {
    const saved = await tx
      .insert(tokens)
      .values(rows)
      .onConflictDoUpdate({
        target: tokens.mint,
        set: {
          symbol: excluded(tokens.symbol),
          name: excluded(tokens.name),
          decimals: excluded(tokens.decimals),
          tokenProgram: excluded(tokens.tokenProgram),
          logoUrl: excluded(tokens.logoUrl),
          isListed: excluded(tokens.isListed),
          sortRank: excluded(tokens.sortRank),
          safetyNote: excluded(tokens.safetyNote),
          updatedAt: sql`now()`,
        },
      })
      .returning({ mint: tokens.mint });
    await tx
      .update(tokens)
      .set({ isListed: false, sortRank: null })
      .where(and(eq(tokens.isListed, true), not(inArray(tokens.mint, listed))));
    return saved.length;
  });
}
