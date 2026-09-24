import { customType } from "drizzle-orm/pg-core";

// Case-insensitive text: "Maya" and "maya" are equal in comparisons and unique indexes.
// The first migration creates the citext extension.
export const citext = customType<{ data: string }>({
  dataType: () => "citext",
});
