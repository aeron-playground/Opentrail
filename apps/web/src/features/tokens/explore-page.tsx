import { formatPrice } from "@repo/format";
import { useId, useState } from "react";
import { EmptyState } from "../../components/common/empty-state";
import { ErrorState } from "../../components/common/error-state";
import { Page } from "../../components/common/page";
import { PriceChange } from "../../components/common/price-change";
import { Sparkline } from "../../components/common/sparkline";
import { TokenIcon } from "../../components/common/token-icon";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { useLivePrices } from "../live/live-prices";
import { type TokenListItem, useTokens } from "./use-tokens";

const SORTS = {
  rank: "Rank",
  change: "24h change",
  price: "Price",
} as const;
type Sort = keyof typeof SORTS;

// Sorting only orders the rows, so numbers are fine here; no money math happens on them.
// Tokens without a value go last.
const byValue =
  (value: (token: TokenListItem) => string | null) => (a: TokenListItem, b: TokenListItem) => {
    const left = value(a);
    const right = value(b);
    if (left === null || right === null) {
      return left === right ? a.rank - b.rank : left === null ? 1 : -1;
    }
    return Number(right) - Number(left) || a.rank - b.rank;
  };

// Placeholder rows while the list loads, named so each keeps its identity.
const SKELETON_ROWS = ["first", "second", "third", "fourth", "fifth"];

const ORDER: Record<Sort, (a: TokenListItem, b: TokenListItem) => number> = {
  rank: (a, b) => a.rank - b.rank,
  change: byValue((token) => token.change24hPct),
  price: byValue((token) => token.priceUsd),
};

export function ExplorePage() {
  useLivePrices();
  const query = useTokens();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("rank");
  const searchId = useId();
  const sortId = useId();

  return (
    <Page title="Explore">
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={searchId} className="text-ink-2 text-meta">
            Search
          </label>
          <Input
            id={searchId}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name or symbol"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-44">
          <label htmlFor={sortId} className="text-ink-2 text-meta">
            Sort by
          </label>
          <select
            id={sortId}
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
            className="min-h-11 rounded-control border border-line bg-paper px-3 text-body text-ink"
          >
            {Object.entries(SORTS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <TokenList query={query} search={search} sort={sort} onClearSearch={() => setSearch("")} />
      <p className="mt-6 text-fine text-ink-3">Chart data: GeckoTerminal</p>
    </Page>
  );
}

function TokenList({
  query,
  search,
  sort,
  onClearSearch,
}: {
  query: ReturnType<typeof useTokens>;
  search: string;
  sort: Sort;
  onClearSearch: () => void;
}) {
  if (query.data === undefined) {
    return query.isError ? (
      <ErrorState
        message="We couldn't load the tokens. Try again."
        onRetry={() => query.refetch()}
      />
    ) : (
      <div role="status" className="mt-4 flex flex-col">
        <span className="sr-only">Loading tokens</span>
        {SKELETON_ROWS.map((row) => (
          <div key={row} className="flex items-center gap-3 border-line border-b py-3">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-7 w-18" />
          </div>
        ))}
      </div>
    );
  }

  const tokens = query.data.items;
  if (tokens.length === 0) {
    return <EmptyState message="No tokens are listed yet." />;
  }
  const words = search.trim().toLowerCase();
  const shown = tokens
    .filter(
      (token) =>
        words === "" ||
        token.symbol.toLowerCase().includes(words) ||
        token.name.toLowerCase().includes(words),
    )
    .sort(ORDER[sort]);
  if (shown.length === 0) {
    return (
      <EmptyState
        message={`No tokens match "${search.trim()}".`}
        action={
          <Button variant="secondary" onClick={onClearSearch}>
            Clear search
          </Button>
        }
      />
    );
  }

  return (
    <ul aria-label="Tokens" className="mt-4 border-line border-t">
      {shown.map((token) => (
        <TokenRow key={token.mint} token={token} />
      ))}
    </ul>
  );
}

function TokenRow({ token }: { token: TokenListItem }) {
  return (
    <li className="flex items-center gap-3 border-line border-b py-3">
      <TokenIcon symbol={token.symbol} logoUrl={token.logoUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-row">{token.symbol}</p>
        <p className="hidden truncate text-ink-2 text-meta sm:block">{token.name}</p>
      </div>
      <div className="flex flex-col items-end sm:w-32">
        <span className="text-row tabular-nums">
          {token.priceUsd === null ? (
            <>
              <span aria-hidden="true" className="text-ink-3">
                —
              </span>
              <span className="sr-only">No price yet</span>
            </>
          ) : (
            formatPrice(token.priceUsd)
          )}
        </span>
        <PriceChange percent={token.change24hPct} className="text-meta sm:hidden" />
      </div>
      <PriceChange percent={token.change24hPct} className="hidden w-24 text-body sm:inline-flex" />
      <Sparkline prices={token.sparkline7d} label="7-day trend" className="shrink-0" />
    </li>
  );
}
