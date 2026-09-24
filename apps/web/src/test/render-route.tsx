import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { createQueryClient } from "../app/query-client";
import { createAppRouter } from "../app/router";

// Renders the whole app, starting on the given path, without a real browser location.
export async function renderRoute(path: string) {
  const queryClient = createQueryClient();
  const router = createAppRouter(
    { queryClient },
    { history: createMemoryHistory({ initialEntries: [path] }) },
  );
  await router.load();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...result, router };
}
