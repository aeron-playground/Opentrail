import { formatTokenAmount } from "@repo/format";
import { useEffect, useState } from "react";
import { Skeleton } from "../../components/ui/skeleton";
import { BALANCE_POLL_MS, type Balances, useBalances } from "./use-balances";

type Amounts = Record<string, bigint>;

const amountsOf = (data: Balances): Amounts =>
  Object.fromEntries(data.balances.map(({ token, amountRaw }) => [token.mint, BigInt(amountRaw)]));

// The person's balances, checked every few seconds, and what arrived since the screen opened.
export function DepositStatus() {
  const query = useBalances({ pollMs: BALANCE_POLL_MS });
  // The first balances seen on this screen: anything above them has just arrived.
  const [start, setStart] = useState<Amounts | null>(null);
  useEffect(() => {
    if (query.data && start === null) {
      setStart(amountsOf(query.data));
    }
  }, [query.data, start]);

  if (!query.data) {
    return query.isError ? (
      <p role="status" className="text-ink-2">
        We couldn't check your balances. We'll keep trying.
      </p>
    ) : (
      <div role="status" className="flex flex-col gap-2">
        <span className="sr-only">Loading your balances</span>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-6 w-40" />
      </div>
    );
  }

  const received = query.data.balances.flatMap(({ token, amountRaw }) => {
    const added = BigInt(amountRaw) - (start?.[token.mint] ?? BigInt(amountRaw));
    return added > 0n ? [formatTokenAmount(added, token.decimals, { symbol: token.symbol })] : [];
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium">Your balances</p>
      <ul className="flex max-w-xs flex-col gap-1">
        {query.data.balances.map(({ token, amountRaw }) => (
          <li key={token.mint} className="flex justify-between gap-6">
            <span>{token.symbol}</span>
            <span className="text-right tabular-nums">
              {formatTokenAmount(BigInt(amountRaw), token.decimals)}
            </span>
          </li>
        ))}
      </ul>
      <p role="status" className="text-ink-2">
        {received.length > 0
          ? `Received ${received.join(" and ")}.`
          : "Waiting for your deposit. This updates by itself."}
      </p>
    </div>
  );
}
