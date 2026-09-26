import { normalizeUsername, usernameProblem } from "@repo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "../../lib/api";
import { useApi } from "../../lib/api-context";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { ME_QUERY_KEY, type Me } from "./use-me";

export type UsernameState =
  | "same"
  | "invalid"
  | "reserved"
  | "checking"
  | "taken"
  | "available"
  | "error";

// What the username field knows about the name typed so far, in its saved (lowercase) form.
export type UsernameCheck = { state: UsernameState; username: string };

// Checks the rules at once, and asks the API whether the name is free once typing pauses.
export function useUsernameCheck(value: string, current: string): UsernameCheck {
  const api = useApi();
  const username = normalizeUsername(value.trim());
  const settled = useDebouncedValue(username, 300);
  const problem = usernameProblem(username);
  const ask = problem === null && username !== current && settled === username;

  const availability = useQuery({
    queryKey: ["username-available", settled],
    queryFn: async () =>
      unwrap(
        await api.GET("/v1/usernames/{name}/available", { params: { path: { name: settled } } }),
      ),
    enabled: ask,
    staleTime: 10_000,
  });

  if (username === current) {
    return { state: "same", username };
  }
  if (problem !== null) {
    return { state: problem, username };
  }
  if (!ask || availability.isPending) {
    return { state: "checking", username };
  }
  if (availability.isError) {
    return { state: "error", username };
  }
  if (availability.data.available) {
    return { state: "available", username };
  }
  // A reason the API added later still means "not available".
  return {
    state: availability.data.reason === "reserved" ? "reserved" : "taken",
    username,
  };
}

// A random name that nobody has, for the Shuffle button.
export function useSuggestUsername() {
  const api = useApi();
  return useMutation({
    mutationFn: async () => unwrap(await api.GET("/v1/usernames/suggest")).username,
  });
}

// Saves a new name, or keeps the current one; the answer replaces the cached account.
export function useChangeUsername() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (username: string) =>
      unwrap(await api.PATCH("/v1/me", { body: { username } })),
    onSuccess: (me: Me) => {
      queryClient.setQueryData(ME_QUERY_KEY, me);
    },
  });
}
