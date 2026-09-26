import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DbHandle = ReturnType<typeof createDb>;
export type Database = DbHandle["db"];
// What db.transaction hands to its callback: the same queries, committed or rolled back together.
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export function createDb(url: string, options: { maxConnections?: number } = {}) {
  const client = postgres(url, {
    max: options.maxConnections ?? 10,
    // Notices such as "extension already exists" are expected during migrations.
    onnotice: () => {},
  });
  return {
    db: drizzle(client, { schema }),
    // Resolves when the database answers a trivial query; health checks use it.
    ping: async (): Promise<void> => {
      await client`select 1`;
    },
    /**
     * Calls `onMessage` with the payload of every notification on `channel`, over a connection of
     * its own that reconnects by itself. Resolves once listening, to a function that stops.
     */
    listen: async (channel: string, onMessage: (payload: string) => void) => {
      const { unlisten } = await client.listen(channel, onMessage);
      return unlisten;
    },
    // Also closes the listening connection.
    close: () => client.end(),
  };
}
