import type { WsChannel, WsServerMessage } from "@repo/shared/ws";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { LiveConnection } from "../../lib/ws";
import { useAuth } from "../auth/auth-context";
import { TOKENS_QUERY_KEY } from "../tokens/query-keys";
import type { TokenList } from "../tokens/use-tokens";
import { BALANCES_QUERY_KEY } from "../wallet/query-keys";
import { useLivePricesWanted } from "./live-prices";

type PriceItems = Extract<WsServerMessage, { type: "price" }>["items"];

// Keeps one live connection to the API while someone is signed in, or while a screen shows
// prices, and updates the data it says changed. Renders nothing.
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
  const pricesWanted = useLivePricesWanted();
  const signedIn = auth.status === "signed-in";
  const connect = signedIn || pricesWanted;
  // The connection outlives renders, and reads these when it needs them.
  const authRef = useRef(auth);
  const pricesWantedRef = useRef(pricesWanted);
  const connectionRef = useRef<LiveConnection | null>(null);
  useEffect(() => {
    authRef.current = auth;
    pricesWantedRef.current = pricesWanted;
  });

  useEffect(() => {
    if (!connect) {
      return;
    }
    let cancelled = false;
    const subscribedBefore = new Set<WsChannel>();
    const refreshBalances = () => {
      void queryClient.invalidateQueries({ queryKey: BALANCES_QUERY_KEY });
    };
    const refreshTokens = () => {
      void queryClient.invalidateQueries({ queryKey: TOKENS_QUERY_KEY });
    };
    // New prices go straight into the cached list: no reload, nothing else changes.
    const applyPrices = (items: PriceItems) => {
      const byMint = new Map(items.map((item) => [item.mint, item]));
      const now = new Date().toISOString();
      queryClient.setQueryData<TokenList>(TOKENS_QUERY_KEY, (list) =>
        list === undefined
          ? list
          : {
              ...list,
              items: list.items.map((token) => {
                const update = byMint.get(token.mint);
                return update === undefined
                  ? token
                  : {
                      ...token,
                      priceUsd: update.priceUsd,
                      change24hPct: update.change24hPct,
                      priceUpdatedAt: now,
                    };
              }),
            },
      );
    };
    // Loaded only now, so people who never need it never download it. If it can't load, Add
    // funds still checks balances every 5 seconds, and the token list is still there.
    import("../../lib/ws")
      .then(({ startLiveConnection }) => {
        if (cancelled) {
          return;
        }
        // Chosen now, not before the import: a screen may have asked for prices while it
        // loaded, and there was no connection yet to subscribe.
        const channels: WsChannel[] = [
          ...(signedIn ? (["me"] as const) : []),
          ...(pricesWantedRef.current ? (["prices"] as const) : []),
        ];
        connectionRef.current = startLiveConnection({
          url,
          getToken: () => authRef.current.getAccessToken(),
          channels,
          createSocket,
          onMessage: (message) => {
            if (message.type === "balance.changed") {
              refreshBalances();
            }
            if (message.type === "price") {
              applyPrices(message.items);
            }
            if (message.type === "subscribed") {
              // Back after a drop: a change may have happened while it was away.
              if (subscribedBefore.has(message.channel)) {
                if (message.channel === "me") refreshBalances();
                else refreshTokens();
              }
              subscribedBefore.add(message.channel);
            }
          },
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      connectionRef.current?.stop();
      connectionRef.current = null;
    };
  }, [connect, signedIn, url, queryClient, createSocket]);

  // A screen with prices opened while connected: add the channel without reconnecting.
  useEffect(() => {
    if (pricesWanted) {
      connectionRef.current?.subscribe("prices");
    }
  }, [pricesWanted]);

  return null;
}
