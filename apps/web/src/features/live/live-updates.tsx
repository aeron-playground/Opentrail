import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { LiveConnection } from "../../lib/ws";
import { useAuth } from "../auth/auth-context";
import { BALANCES_QUERY_KEY } from "../wallet/query-keys";

// While someone is signed in, keeps one live connection to the API and refreshes the data it
// says changed. Renders nothing.
export function LiveUpdates({
  url,
  createSocket,
}: {
  url: string;
  // Tests pass a fake.
  createSocket?: (url: string) => WebSocket;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  // The connection outlives renders, and asks the current auth for each token.
  const authRef = useRef(auth);
  useEffect(() => {
    authRef.current = auth;
  });

  useEffect(() => {
    if (auth.status !== "signed-in") {
      return;
    }
    let connection: LiveConnection | null = null;
    let cancelled = false;
    let subscribedBefore = false;
    const refreshBalances = () => {
      void queryClient.invalidateQueries({ queryKey: BALANCES_QUERY_KEY });
    };
    // Loaded only now, so people who never sign in never download it. If it can't load, Add
    // funds still checks balances every 5 seconds.
    import("../../lib/ws")
      .then(({ startLiveConnection }) => {
        if (cancelled) {
          return;
        }
        connection = startLiveConnection({
          url,
          getToken: () => authRef.current.getAccessToken(),
          createSocket,
          onMessage: (message) => {
            if (message.type === "balance.changed") {
              refreshBalances();
            }
            if (message.type === "subscribed") {
              // Back after a drop: a change may have happened while it was away.
              if (subscribedBefore) {
                refreshBalances();
              }
              subscribedBefore = true;
            }
          },
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      connection?.stop();
    };
  }, [auth.status, url, queryClient, createSocket]);

  return null;
}
