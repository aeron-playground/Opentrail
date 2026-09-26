import { createRoute, z } from "@hono/zod-openapi";
import { normalizeUsername } from "@repo/shared";
import { ErrorBodySchema } from "../../lib/errors";
import { createRouter } from "../../lib/router";
import type { UsernameService } from "../../services/usernames";

const UsernameSuggestionSchema = z
  .object({
    username: z.string().openapi({
      description: "A random name that nobody has right now.",
      example: "calm_otter_42",
    }),
  })
  .openapi("UsernameSuggestion");

const UsernameAvailabilitySchema = z
  .object({
    username: z.string().openapi({
      description: "The name as it would be saved: in lowercase.",
      example: "maya",
    }),
    available: z.boolean(),
    // A string, not an enum: more reasons may come, and clients must treat any reason as "no".
    reason: z
      .string()
      .optional()
      .openapi({
        description:
          "Why the name isn't available: `taken` (someone has it, maybe you), `reserved` " +
          "(blocked, or too close to a blocked name) or `invalid` (breaks the format). " +
          "Treat any other value as not available.",
        example: "taken",
      }),
  })
  .openapi("UsernameAvailability");

const suggestRoute = createRoute({
  method: "get",
  path: "/usernames/suggest",
  tags: ["Usernames"],
  summary: "Suggest a username",
  description: "A random `adjective_animal_NN` name that nobody has. No sign-in needed.",
  responses: {
    200: {
      description: "A free name.",
      content: { "application/json": { schema: UsernameSuggestionSchema } },
    },
  },
});

const availableRoute = createRoute({
  method: "get",
  path: "/usernames/{name}/available",
  tags: ["Usernames"],
  summary: "Check whether a username is free",
  description:
    "Usernames are 3–20 characters: a–z, 0–9 and _, starting with a letter. Case doesn't " +
    "matter. No sign-in needed.",
  request: {
    params: z.object({
      name: z
        .string()
        .min(1)
        .max(64)
        .openapi({ param: { name: "name", in: "path" }, example: "maya" }),
    }),
  },
  responses: {
    200: {
      description: "Whether the name is free.",
      content: { "application/json": { schema: UsernameAvailabilitySchema } },
    },
    400: {
      description: "`VALIDATION_FAILED`: the name is longer than 64 characters.",
      content: { "application/json": { schema: ErrorBodySchema } },
    },
  },
});

export type UsernameDeps = {
  usernames: UsernameService;
};

export function usernameRoutes({ usernames }: UsernameDeps) {
  return createRouter()
    .openapi(suggestRoute, async (c) => {
      // Random on every call: nothing may cache it.
      c.header("Cache-Control", "no-store");
      return c.json({ username: await usernames.suggest() }, 200);
    })
    .openapi(availableRoute, async (c) => {
      const { name } = c.req.valid("param");
      const result = await usernames.availability(name);
      // Someone can take the name at any moment.
      c.header("Cache-Control", "no-store");
      return c.json({ username: normalizeUsername(name), ...result }, 200);
    });
}
