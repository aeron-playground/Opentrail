import { QueryClient } from "@tanstack/react-query";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // One retry, then the screen shows its error state with "Try again".
        retry: 1,
      },
    },
  });
}
