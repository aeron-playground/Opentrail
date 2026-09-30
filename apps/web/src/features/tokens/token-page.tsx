import { formatChangePercent, formatPrice, formatRelativeTime, formatUsd } from "@repo/format";
import { compareDecimals, mulDiv, parseDecimal, percentChange, pow10 } from "@repo/pnl";
import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { lazy, Suspense, useId, useState } from "react";
import { EmptyState } from "../../components/common/empty-state";
import { ErrorState } from "../../components/common/error-state";
import { PriceChange } from "../../components/common/price-change";
import { TokenIcon } from "../../components/common/token-icon";
import { buttonVariants } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/cn";
import { useLivePrices } from "../live/live-prices";
import { CHART_RANGES, type ChartRange } from "./chart-ranges";
import type { ChartDirection, ChartPoint } from "./price-chart";
import { type Candle, useCandles } from "./use-candles";
import { isUnknownToken, type TokenDetail, useToken } from "./use-token";

const PriceChart = lazy(() =>
  import("./price-chart").then((module) => ({ default: module.PriceChart })),
);

const FRAME = "mx-auto w-full max-w-feed px-4 py-8 lg:py-10";
const RANGES = Object.keys(CHART_RANGES) as ChartRange[];

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const CANDLE_MS = { "15m": 15 * MINUTE_MS, "1h": HOUR_MS, "4h": 4 * HOUR_MS, "1d": DAY_MS };

export function TokenPage({ mint }: { mint: string }) {
  useLivePrices();
  const query = useToken(mint);

  if (query.data !== undefined) {
    return <TokenView token={query.data} />;
  }
  return (
    <section className={FRAME}>
      {isUnknownToken(query.error) ? (
        <>
          <h1 className="sr-only">Token not found</h1>
          <EmptyState
            message="We couldn't find this token."
            action={
              <Link to="/explore" className={buttonVariants({ variant: "secondary" })}>
                Back to Explore
              </Link>
            }
          />
        </>
      ) : query.isError ? (
        <>
          <h1 className="sr-only">Token</h1>
          <ErrorState
            message="We couldn't load this token. Try again."
            onRetry={() => query.refetch()}
          />
        </>
      ) : (
        <div role="status" className="flex flex-col gap-4">
          <span className="sr-only">Loading token</span>
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 rounded-full" />
            <Skeleton className="h-8 w-32" />
          </div>
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-60 w-full sm:h-72" />
        </div>
      )}
    </section>
  );
}

function TokenView({ token }: { token: TokenDetail }) {
  const [range, setRange] = useState<ChartRange>("1D");
  const candles = useCandles(token.mint, range);
  const items = candles.data ?? [];
  const change = rangeChange(token, range, items, Date.now());
  const direction: ChartDirection =
    change.percent === null ? "flat" : formatChangePercent(change.percent).direction;

  return (
    <section className={FRAME}>
      <header className="flex items-center gap-3">
        <TokenIcon symbol={token.symbol} logoUrl={token.logoUrl} className="size-12" />
        <div className="min-w-0">
          <h1 className="font-condensed font-semibold text-title">{token.symbol}</h1>
          <p className="truncate text-ink-2 text-meta">{token.name}</p>
        </div>
      </header>

      <div className="mt-6">
        <p className="font-condensed font-semibold text-hero tabular-nums lg:text-hero-lg">
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
        </p>
        <p className="mt-1 flex items-center gap-2 text-body">
          <PriceChange percent={change.percent} missing="No change to show yet" />
          <span className="text-ink-2">{change.words}</span>
        </p>
      </div>

      <fieldset className="mt-6 flex gap-1">
        <legend className="sr-only">Chart range</legend>
        {RANGES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === range}
            onClick={() => setRange(option)}
            className={cn(
              "min-h-11 min-w-11 rounded-control px-3 font-medium text-body",
              option === range ? "bg-paper-2 text-ink" : "text-ink-2",
            )}
          >
            {option}
          </button>
        ))}
      </fieldset>

      <figure className="mt-4">
        <ChartArea
          query={candles}
          points={chartPoints(items, token.priceUsd, range, Date.now())}
          direction={direction}
          range={range}
          words={change.words}
        />
        <figcaption className="mt-2 flex flex-col gap-1 text-fine text-ink-3">
          <span>Chart data: GeckoTerminal</span>
          <span>
            Chart by TradingView Lightweight Charts™, © 2025{" "}
            <a
              href="https://www.tradingview.com/"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              TradingView, Inc.
            </a>
          </span>
        </figcaption>
      </figure>

      <Stats stats={token.stats} />
    </section>
  );
}

function ChartArea({
  query,
  points,
  direction,
  range,
  words,
}: {
  query: UseQueryResult<Candle[]>;
  points: ChartPoint[];
  direction: ChartDirection;
  range: ChartRange;
  // The same words as the change above the chart, such as "past week" or "since Mar 31".
  words: string;
}) {
  const placeholder = <Skeleton className="h-60 w-full sm:h-72" />;
  if (query.data === undefined) {
    return query.isError ? (
      <ErrorState
        message="We couldn't load the chart. Try again."
        onRetry={() => query.refetch()}
      />
    ) : (
      <div role="status">
        <span className="sr-only">Loading chart</span>
        {placeholder}
      </div>
    );
  }
  // Counted in candles: the live price alone doesn't make a chart of the range.
  if (query.data.length < 2) {
    return <EmptyState message="No chart for this range yet." />;
  }
  return (
    // The drawing is a canvas, which screen readers can't read; the label says what it shows.
    <div role="img" aria-label={chartSummary(points, query.data, words)}>
      <Suspense fallback={placeholder}>
        <PriceChart
          points={points}
          direction={direction}
          intraday={range === "1D" || range === "1W"}
        />
      </Suspense>
    </div>
  );
}

function Stats({ stats }: { stats: TokenDetail["stats"] }) {
  const rows = [
    ["Market cap", stats.marketCapUsd],
    ["Liquidity", stats.liquidityUsd],
    ["24h volume", stats.volume24hUsd],
  ].filter((row): row is [string, string] => row[1] !== null);
  const headingId = useId();
  // Until the token is checked, nothing is known; the section appears once something is.
  if (rows.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby={headingId} className="mt-8">
      <h2 id={headingId} className="font-semibold text-section">
        Stats
      </h2>
      <dl className="mt-2 border-line border-t">
        {rows.map(([label, dollars]) => (
          <div key={label} className="flex justify-between gap-4 border-line border-b py-3">
            <dt className="text-ink-2">{label}</dt>
            <dd className="tabular-nums">{formatUsd(dollarsToMicro(dollars))}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// The change over the range and the words for it. 1D shows the same 24-hour change as Explore.
// A longer range compares its first candle's open with the latest price; when the history starts
// later than the range, the words say since when.
export function rangeChange(
  token: TokenDetail,
  range: ChartRange,
  candles: readonly Candle[],
  now: number,
): { percent: string | null; words: string } {
  const { days, timeframe, words } = CHART_RANGES[range];
  if (range === "1D") {
    return { percent: token.change24hPct, words };
  }
  const first = candles[0];
  const latest = token.priceUsd ?? candles.at(-1)?.close ?? null;
  if (first === undefined || latest === null) {
    return { percent: null, words };
  }
  const start = Date.parse(first.start);
  const startsLate = start - (now - days * DAY_MS) > CANDLE_MS[timeframe];
  return {
    percent: percentChange(first.open, latest),
    words: startsLate ? `since ${formatRelativeTime(new Date(start), new Date(now))}` : words,
  };
}

// The candles' closing prices, ending at the live price: the newest candle is still open, so its
// point follows the price; after a closed one, the price gets a point in the current slot.
export function chartPoints(
  candles: readonly Candle[],
  livePrice: string | null,
  range: ChartRange,
  now: number,
): ChartPoint[] {
  const points = candles.map((candle) => ({ start: candle.start, price: candle.close }));
  const last = points.at(-1);
  if (last === undefined || livePrice === null) {
    return points;
  }
  const slot = CANDLE_MS[CHART_RANGES[range].timeframe];
  if (Date.parse(last.start) + slot > now) {
    points[points.length - 1] = { start: last.start, price: livePrice };
  } else {
    points.push({ start: new Date(Math.floor(now / slot) * slot).toISOString(), price: livePrice });
  }
  return points;
}

function chartSummary(points: readonly ChartPoint[], candles: readonly Candle[], words: string) {
  const first = points[0]?.price ?? "0";
  const last = points.at(-1)?.price ?? "0";
  const high = candles.map((candle) => candle.high).reduce(maxOf, last);
  const low = candles.map((candle) => candle.low).reduce(minOf, last);
  return (
    `Price chart, ${words}: from ${formatPrice(first)} to ${formatPrice(last)}, ` +
    `high ${formatPrice(maxOf(high, last))}, low ${formatPrice(minOf(low, last))}.`
  );
}

const maxOf = (a: string, b: string) => (compareDecimals(a, b) >= 0 ? a : b);
const minOf = (a: string, b: string) => (compareDecimals(a, b) <= 0 ? a : b);

// Stats come in dollars as decimal strings; the money formatter takes micro-dollars.
const dollarsToMicro = (dollars: string) => {
  const { digits, scale } = parseDecimal(dollars);
  return mulDiv(digits, pow10(6), pow10(scale));
};
