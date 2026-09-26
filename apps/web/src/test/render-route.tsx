import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { AppProviders } from "../app/app";
import { createQueryClient } from "../app/query-client";
import { createAppRouter } from "../app/router";
import { LiveUpdates } from "../features/live/live-updates";
import { createWebApi } from "../lib/api";
import { createFakeApi, type FakeApi } from "./fake-api";
import { createFakeAuth, type FakeAuth } from "./fake-auth";

// Renders the whole app, starting on the given path, without a real browser location. Sign-in
// and the API are fakes; by default nobody is signed in. With `liveSocket`, live updates connect
// through that fake socket.
export async function renderRoute(
  path: string,
  {
    auth = createFakeAuth(),
    api = createFakeApi(),
    liveSocket,
  }: { auth?: FakeAuth; api?: FakeApi; liveSocket?: (url: string) => WebSocket } = {},
) {
  const queryClient = createQueryClient();
  const router = createAppRouter(
    { queryClient },
    { history: createMemoryHistory({ initialEntries: [path] }) },
  );
  const client = createWebApi("http://api.test", auth.getAccessToken, api.fetch);
  await router.load();
  const result = render(
    <auth.Provider>
      <AppProviders queryClient={queryClient} api={client}>
        {liveSocket && <LiveUpdates url="ws://api.test/v1/ws" createSocket={liveSocket} />}
        <RouterProvider router={router} />
      </AppProviders>
    </auth.Provider>,
  );
  return { ...result, router, auth, api, queryClient };
}
