import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { WebEnv } from "../env";
import { useAuth } from "../features/auth/auth-context";
import { PrivyAuthProvider } from "../features/auth/privy-auth-provider";
import { type ApiClient, createWebApi } from "../lib/api";
import { ApiProvider } from "../lib/api-context";
import { createQueryClient } from "./query-client";
import { createAppRouter } from "./router";

export function App({ env }: { env: WebEnv }) {
  return (
    <PrivyAuthProvider appId={env.privyAppId}>
      <LiveApp apiUrl={env.apiUrl} />
    </PrivyAuthProvider>
  );
}

function LiveApp({ apiUrl }: { apiUrl: string }) {
  const auth = useAuth();
  // The API client lives as long as the app, and asks the current auth for each token.
  const authRef = useRef(auth);
  useEffect(() => {
    authRef.current = auth;
  });
  const [queryClient] = useState(createQueryClient);
  const [api] = useState(() => createWebApi(apiUrl, () => authRef.current.getAccessToken()));
  const [router] = useState(() => createAppRouter({ queryClient }));
  return (
    <AppProviders queryClient={queryClient} api={api}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}

// Shared by the app and the tests, which pass a fake API.
export function AppProviders({
  queryClient,
  api,
  children,
}: {
  queryClient: QueryClient;
  api: ApiClient;
  children: ReactNode;
}) {
  const { status } = useAuth();
  // Signed out: nothing of the last person's data may stay on the screen or in memory.
  useEffect(() => {
    if (status === "signed-out") {
      queryClient.clear();
    }
  }, [status, queryClient]);
  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>{children}</ApiProvider>
    </QueryClientProvider>
  );
}
