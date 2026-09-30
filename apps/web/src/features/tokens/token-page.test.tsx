import { describe, expect, mock, test } from "bun:test";
import { formatRelativeTime } from "@repo/format";
import type { WsServerMessage } from "@repo/shared/ws";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChartDirection, ChartPoint } from "./price-chart";

// The chart draws on a canvas, which the test page doesn't have. A stand-in keeps what it was
// asked to draw.
type Drawing = { points: readonly ChartPoint[]; direction: ChartDirection; intraday: boolean };
const drawings: Drawing[] = [];
mock.module("./price-chart", () => ({
  PriceChart: (props: Drawing) => {
    drawings.push(props);
    return <div data-testid="chart" />;
  },
}));

const { createFakeApi } = await import("../../test/fake-api");
const { createFakeAuth } = await import("../../test/fake-auth");
const { fakeSockets } = await import("../../test/fake-socket");
const { renderRoute } = await import("../../test/render-route");
const { chartPoints, rangeChange } = await import("./token-page");

// Real mints (public data). USDC isn't in the fake list.
const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

async function tokenPage(path = `/token/${SOL}`, { api = createFakeApi() } = {}) {
  drawings.length = 0;
  const sockets = fakeSockets();
  const rendered = await renderRoute(path, {
    api,
    auth: createFakeAuth({ status: "signed-out" }),
    liveSocket: sockets.create,
  });
  return { ...rendered, sockets, user: userEvent.setup() };
}

const candleRequests = (api: ReturnType<typeof createFakeApi>) =>
  api.requests
    .map((request) => new URL(request.url))
    .filter((url) => url.pathname.endsWith("/candles"))
    .map((url) => url.searchParams.get("tf"));

const candle = (start: number, close: string, open = close) => ({
  start: new Date(start).toISOString(),
  open,
  high: close,
  low: close,
  close,
  volumeUsd: "1000",
});

describe("token page", () => {
  test("shows the token, its price, its 24-hour change and a day of 15-minute candles", async () => {
    const api = createFakeApi();
    await tokenPage(`/token/${SOL}`, { api });

    expect(await screen.findByRole("heading", { level: 1, name: "SOL" })).toBeDefined();
    expect(screen.getByText("Wrapped SOL")).toBeDefined();
    expect(screen.getByText("$118.93")).toBeDefined();
    expect(screen.getByText("+0.40%")).toBeDefined();
    expect(screen.getByText("past 24 hours")).toBeDefined();
    expect(screen.getByRole("button", { name: "1D" }).getAttribute("aria-pressed")).toBe("true");

    expect(await screen.findByTestId("chart")).toBeDefined();
    expect(candleRequests(api)).toEqual(["15m"]);
    expect(drawings.at(-1)).toMatchObject({ direction: "up", intraday: true });
    expect(drawings.at(-1)?.points.map((point) => point.price)).toEqual(["110", "115", "118.9"]);
    expect(
      screen.getByRole("img", {
        name: "Price chart, past 24 hours: from $110.00 to $118.90, high $118.90, low $110.00.",
      }),
    ).toBeDefined();
  });

  test("credits the chart's data and its drawing", async () => {
    await tokenPage();
    expect(await screen.findByText("Chart data: GeckoTerminal")).toBeDefined();
    expect(screen.getByRole("link", { name: "TradingView, Inc." }).getAttribute("href")).toBe(
      "https://www.tradingview.com/",
    );
  });

  test("a longer range reads its own candles and compares its first open with the price", async () => {
    const api = createFakeApi();
    const { user } = await tokenPage(`/token/${SOL}`, { api });
    await screen.findByTestId("chart");

    await user.click(screen.getByRole("button", { name: "1W" }));

    expect(screen.getByRole("button", { name: "1W" }).getAttribute("aria-pressed")).toBe("true");
    // From the first open, $108, to the price, $118.9269…: up 10.1175%.
    expect(await screen.findByText("+10.12%")).toBeDefined();
    expect(screen.getByText("past week")).toBeDefined();
    await waitFor(() => expect(candleRequests(api)).toEqual(["15m", "1h"]));

    await user.click(screen.getByRole("button", { name: "1M" }));
    await waitFor(() => expect(candleRequests(api)).toEqual(["15m", "1h", "4h"]));
    await waitFor(() => expect(drawings.at(-1)?.intraday).toBe(false));
  });

  test("says since when, when the history is shorter than the range", async () => {
    const start = Date.now() - 180 * DAY_MS;
    const api = createFakeApi({
      candles: { "1d": [candle(start, "100", "100"), candle(Date.now() - DAY_MS, "90")] },
    });
    const { user } = await tokenPage(`/token/${SOL}`, { api });
    await screen.findByTestId("chart");

    await user.click(screen.getByRole("button", { name: "1Y" }));

    const since = `since ${formatRelativeTime(new Date(start), new Date())}`;
    expect(await screen.findByText(since)).toBeDefined();
    expect(screen.getByText("+18.93%")).toBeDefined();
  });

  test("a live price moves the price and the newest point, which is still open", async () => {
    const api = createFakeApi({
      candles: {
        "15m": [
          candle(Date.now() - 30 * MINUTE_MS, "117"),
          candle(Date.now() - 5 * MINUTE_MS, "118"),
        ],
      },
    });
    const { sockets } = await tokenPage(`/token/${SOL}`, { api });
    await screen.findByTestId("chart");
    await waitFor(() => expect(sockets.all).toHaveLength(1));
    const socket = sockets.latest();
    await act(async () => socket.opened());
    await waitFor(() => expect(socket.sent).toEqual([{ type: "subscribe", channel: "prices" }]));
    // The open candle already follows the price.
    expect(drawings.at(-1)?.points.map((point) => point.price)).toEqual([
      "117",
      "118.92690462188556",
    ]);

    const message = {
      v: 1,
      type: "price",
      items: [{ mint: SOL, priceUsd: "121.5", change24hPct: "2.5" }],
    };
    await act(async () => socket.receive(JSON.stringify(message satisfies WsServerMessage)));

    expect(await screen.findByText("$121.50")).toBeDefined();
    expect(screen.getByText("+2.50%")).toBeDefined();
    expect(drawings.at(-1)?.points.map((point) => point.price)).toEqual(["117", "121.5"]);
  });

  test.each([
    ["a token it doesn't know", `/token/${USDC}`],
    ["an address that isn't one", "/token/not-a-mint"],
  ])("says so for %s, without asking again, and leads back to Explore", async (_, path) => {
    const api = createFakeApi();
    await tokenPage(path, { api });

    expect(await screen.findByText("We couldn't find this token.")).toBeDefined();
    expect(screen.getByRole("link", { name: "Back to Explore" }).getAttribute("href")).toBe(
      "/explore",
    );
    expect(api.requests.filter((request) => request.url.includes("/v1/tokens/"))).toHaveLength(1);
  });

  test("says when the token can't load, and tries again", async () => {
    const api = createFakeApi({ tokenFail: true });
    const { user } = await tokenPage(`/token/${SOL}`, { api });
    expect(
      await screen.findByText("We couldn't load this token. Try again.", {}, { timeout: 3000 }),
    ).toBeDefined();

    api.setTokenFail(false);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "SOL" })).toBeDefined();
  });

  test("says when the chart can't load, and tries again", async () => {
    const api = createFakeApi();
    const { user } = await tokenPage(`/token/${SOL}`, { api });
    await screen.findByTestId("chart");

    api.setTokenFail(true);
    await user.click(screen.getByRole("button", { name: "1W" }));
    expect(
      await screen.findByText("We couldn't load the chart. Try again.", {}, { timeout: 3000 }),
    ).toBeDefined();

    api.setTokenFail(false);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("chart")).toBeDefined();
  });

  test("says when a range has no chart yet", async () => {
    await tokenPage(`/token/${SOL}`, {
      api: createFakeApi({ candles: { "15m": [candle(Date.now() - DAY_MS, "118")] } }),
    });
    expect(await screen.findByText("No chart for this range yet.")).toBeDefined();
  });

  test("lists the stats that are known", async () => {
    await tokenPage(`/token/${SOL}`, {
      api: createFakeApi({
        details: {
          [SOL]: {
            stats: { marketCapUsd: "1100000000", liquidityUsd: "38000000.5", volume24hUsd: null },
          },
        },
      }),
    });
    const stats = within(await screen.findByRole("region", { name: "Stats" }));
    expect(stats.getByText("Market cap").nextElementSibling?.textContent).toBe("$1.1B");
    expect(stats.getByText("Liquidity").nextElementSibling?.textContent).toBe("$38M");
    expect(stats.queryByText("24h volume")).toBeNull();
  });

  test("shows no stats before the token is checked", async () => {
    await tokenPage();
    await screen.findByTestId("chart");
    expect(screen.queryByRole("heading", { name: "Stats" })).toBeNull();
  });

  test("opens from a row on Explore", async () => {
    const { user } = await tokenPage("/explore");
    await user.click(await screen.findByRole("link", { name: /^SOL Wrapped SOL/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "SOL" })).toBeDefined();
  });
});

describe("rangeChange", () => {
  const token = {
    mint: SOL,
    symbol: "SOL",
    name: "Wrapped SOL",
    decimals: 9,
    logoUrl: null,
    isListed: true,
    rank: 1,
    priceUsd: null,
    change24hPct: null,
    priceUpdatedAt: null,
    safety: { level: null, note: null },
    stats: { marketCapUsd: null, liquidityUsd: null, volume24hUsd: null },
  };
  const now = Date.parse("2026-09-30T12:00:00Z");

  test("has nothing to compare without candles or a price", () => {
    expect(rangeChange(token, "1W", [], now)).toEqual({ percent: null, words: "past week" });
  });

  test("uses the newest close when there's no price yet", () => {
    const candles = [candle(now - 7 * DAY_MS, "2", "2"), candle(now - DAY_MS, "3")];
    expect(rangeChange(token, "1W", candles, now)).toEqual({ percent: "50", words: "past week" });
  });
});

describe("chartPoints", () => {
  const now = Date.parse("2026-09-30T12:00:00Z");

  test("leaves a closed newest candle as it is", () => {
    const candles = [candle(now - 60 * MINUTE_MS, "1"), candle(now - 30 * MINUTE_MS, "2")];
    expect(chartPoints(candles, "5", "1D", now).map((point) => point.price)).toEqual(["1", "2"]);
  });

  test("keeps the open candle's close without a live price", () => {
    const candles = [candle(now - 5 * MINUTE_MS, "2")];
    expect(chartPoints(candles, null, "1D", now).map((point) => point.price)).toEqual(["2"]);
  });
});
