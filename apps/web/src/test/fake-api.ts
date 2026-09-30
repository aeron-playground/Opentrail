import { normalizeUsername, USERNAME_CHANGE_DAYS, usernameProblem } from "@repo/shared";
import { SOL, USDC } from "@repo/solana";
import type { Me } from "../features/account/use-me";
import { CHART_RANGES } from "../features/tokens/chart-ranges";
import type { Candle } from "../features/tokens/use-candles";
import type { TokenDetail } from "../features/tokens/use-token";
import type { TokenListItem } from "../features/tokens/use-tokens";
import { FAKE_TOKEN } from "./fake-auth";

const DAY_MS = 24 * 60 * 60 * 1000;

// A returning person: their username is chosen, and they may change it now.
export const FAKE_ME: Me = {
  id: "0192b6f0-7c1e-7a3b-9d7e-3f5c1a2b4d6e",
  username: "calm_otter_42",
  usernameChosen: true,
  usernameChangeableAt: null,
  // Not a real address: made up for these tests.
  walletAddress: "FakeWalletAddressForTests",
  createdAt: "2026-09-26T10:00:00.000Z",
};

// Someone who just signed in for the first time.
export const NEW_ME: Me = { ...FAKE_ME, usernameChosen: false };

// Real mints and prices from the local API (public data), with made-up sparklines.
export const FAKE_TOKENS: TokenListItem[] = [
  {
    mint: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    name: "Wrapped SOL",
    decimals: 9,
    logoUrl: null,
    rank: 1,
    priceUsd: "118.92690462188556",
    change24hPct: "0.3965",
    priceUpdatedAt: "2026-09-30T15:42:10.563Z",
    sparkline7d: ["116", "117.5", "118.9"],
  },
  {
    mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    symbol: "JUP",
    name: "Jupiter",
    decimals: 6,
    logoUrl: null,
    rank: 2,
    priceUsd: "0.3249568595792189",
    change24hPct: "-4.8212",
    priceUpdatedAt: "2026-09-30T15:42:10.563Z",
    sparkline7d: ["0.34", "0.33", "0.325"],
  },
  {
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    symbol: "Bonk",
    name: "Bonk",
    decimals: 5,
    logoUrl: null,
    rank: 3,
    priceUsd: null,
    change24hPct: null,
    priceUpdatedAt: null,
    sparkline7d: [],
  },
];

type Timeframe = (typeof CHART_RANGES)[keyof typeof CHART_RANGES]["timeframe"];
const RANGE_DAYS = Object.fromEntries(
  Object.values(CHART_RANGES).map(({ timeframe, days }) => [timeframe, days]),
) as Record<Timeframe, number>;

// Three candles across the timeframe's whole range, the first right at its start, like the API's
// answer when no `from` is given.
function fakeCandles(timeframe: Timeframe, closes = ["110", "115", "118.9"]): Candle[] {
  const span = RANGE_DAYS[timeframe] * DAY_MS;
  const first = Date.now() - span + 60_000;
  return closes.map((close, index) => ({
    start: new Date(first + (index * span) / closes.length).toISOString(),
    open: index === 0 ? "108" : (closes[index - 1] ?? close),
    high: close,
    low: close,
    close,
    volumeUsd: "1000",
  }));
}

// A token's page data, built from its row in the list.
function detailOf({ rank, sparkline7d: _, ...token }: TokenListItem): TokenDetail {
  return {
    ...token,
    isListed: true,
    rank,
    safety: { level: null, note: null },
    stats: { marketCapUsd: null, liquidityUsd: null, volume24hUsd: null },
  };
}

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type FakeApi = {
  fetch: (request: Request) => Promise<Response>;
  requests: Request[];
  me: () => Me;
  /** What the wallet holds from now on, in raw units. */
  setBalances: (balances: { usdc?: bigint; sol?: bigint }) => void;
  /** Whether GET /v1/tokens fails from now on. */
  setTokensFail: (fail: boolean) => void;
  /** Whether GET /v1/tokens/{mint} and its candles fail from now on. */
  setTokenFail: (fail: boolean) => void;
};

type FakeApiOptions = {
  me?: Me;
  // How many times /v1/me answers WALLET_NOT_READY before it answers with the account.
  walletNotReadyTimes?: number;
  meFails?: boolean;
  // Names other people already have.
  taken?: string[];
  // What Shuffle suggests, in order.
  suggestions?: string[];
  suggestFails?: boolean;
  balances?: { usdc?: bigint; sol?: bigint };
  balancesFail?: boolean;
  tokens?: TokenListItem[];
  tokensFail?: boolean;
  // Changes to a token's page data, by mint.
  details?: Record<string, Partial<TokenDetail>>;
  // Candles by timeframe, instead of three across the range.
  candles?: Partial<Record<Timeframe, Candle[]>>;
  tokenFail?: boolean;
};

// Answers like the real API, for the routes the web app calls. No network.
export function createFakeApi({
  me: initialMe = FAKE_ME,
  walletNotReadyTimes = 0,
  meFails = false,
  taken = [],
  suggestions = ["brave_heron_07", "keen_lynx_11"],
  suggestFails = false,
  balances: initialBalances = {},
  balancesFail = false,
  tokens = FAKE_TOKENS,
  tokensFail: initialTokensFail = false,
  details = {},
  candles = {},
  tokenFail: initialTokenFail = false,
}: FakeApiOptions = {}): FakeApi {
  let tokensFail = initialTokensFail;
  let tokenFail = initialTokenFail;
  let wallet = { usdc: 0n, sol: 0n, ...initialBalances };
  let me = initialMe;
  let notReady = walletNotReadyTimes;
  const nextSuggestions = [...suggestions];
  const takenNames = new Set(taken);
  const requests: Request[] = [];

  function availability(name: string) {
    const username = normalizeUsername(name);
    const problem = usernameProblem(username);
    if (problem) {
      return { username, available: false, reason: problem };
    }
    if (takenNames.has(username) || username === me.username) {
      return { username, available: false, reason: "taken" };
    }
    return { username, available: true };
  }

  async function changeUsername(request: Request): Promise<Response> {
    const body = (await request.json()) as { username?: unknown };
    if (typeof body.username !== "string") {
      return errorResponse(400, "VALIDATION_FAILED");
    }
    const username = normalizeUsername(body.username);
    const problem = usernameProblem(username);
    if (problem === "invalid") {
      return errorResponse(400, "VALIDATION_FAILED");
    }
    if (problem === "reserved") {
      return errorResponse(409, "USERNAME_RESERVED");
    }
    const now = Date.now();
    const lockedUntil = me.usernameChangeableAt ? Date.parse(me.usernameChangeableAt) : 0;
    if (username === me.username) {
      if (!me.usernameChosen) {
        me = {
          ...me,
          usernameChosen: true,
          usernameChangeableAt: new Date(now + USERNAME_CHANGE_DAYS * DAY_MS).toISOString(),
        };
      }
      return Response.json(me);
    }
    if (lockedUntil > now) {
      return errorResponse(429, "USERNAME_CHANGE_TOO_SOON");
    }
    if (takenNames.has(username)) {
      return errorResponse(409, "USERNAME_TAKEN");
    }
    me = {
      ...me,
      username,
      usernameChosen: true,
      usernameChangeableAt: new Date(now + USERNAME_CHANGE_DAYS * DAY_MS).toISOString(),
    };
    return Response.json(me);
  }

  return {
    requests,
    me: () => me,
    setBalances: (next) => {
      wallet = { ...wallet, ...next };
    },
    setTokensFail: (fail) => {
      tokensFail = fail;
    },
    setTokenFail: (fail) => {
      tokenFail = fail;
    },
    fetch: async (request) => {
      requests.push(request);
      const { pathname } = new URL(request.url);

      const available = /^\/v1\/usernames\/([^/]+)\/available$/.exec(pathname);
      if (request.method === "GET" && available?.[1] !== undefined) {
        return Response.json(availability(decodeURIComponent(available[1])));
      }
      if (request.method === "GET" && pathname === "/v1/usernames/suggest") {
        const username = nextSuggestions.shift();
        return suggestFails || username === undefined
          ? errorResponse(500, "INTERNAL")
          : Response.json({ username });
      }

      if (request.method === "GET" && pathname === "/v1/tokens") {
        return tokensFail
          ? errorResponse(500, "INTERNAL")
          : Response.json({ items: tokens, nextCursor: null });
      }

      const token = /^\/v1\/tokens\/([^/]+)(\/candles)?$/.exec(pathname);
      if (request.method === "GET" && token?.[1] !== undefined) {
        const mint = decodeURIComponent(token[1]);
        const listed = tokens.find((item) => item.mint === mint);
        if (!SOLANA_ADDRESS.test(mint)) {
          return errorResponse(400, "VALIDATION_FAILED");
        }
        if (tokenFail) {
          return errorResponse(500, "INTERNAL");
        }
        if (listed === undefined) {
          return errorResponse(404, "NOT_FOUND");
        }
        if (token[2] === undefined) {
          return Response.json({ ...detailOf(listed), ...details[mint] });
        }
        const timeframe = new URL(request.url).searchParams.get("tf") as Timeframe;
        return Response.json({
          mint,
          timeframe,
          items: candles[timeframe] ?? fakeCandles(timeframe),
        });
      }

      if (request.method === "GET" && pathname === "/v1/me/balances") {
        if (request.headers.get("authorization") !== `Bearer ${FAKE_TOKEN}`) {
          return errorResponse(401, "UNAUTHORIZED");
        }
        if (balancesFail) {
          return errorResponse(500, "INTERNAL");
        }
        return Response.json({
          balances: [
            { token: USDC, amountRaw: wallet.usdc.toString() },
            { token: SOL, amountRaw: wallet.sol.toString() },
          ],
          updatedAt: new Date().toISOString(),
        });
      }
      if (pathname !== "/v1/me") {
        return errorResponse(404, "NOT_FOUND");
      }
      if (request.headers.get("authorization") !== `Bearer ${FAKE_TOKEN}`) {
        return errorResponse(401, "UNAUTHORIZED");
      }
      if (request.method === "PATCH") {
        return changeUsername(request);
      }
      if (notReady > 0) {
        notReady -= 1;
        return errorResponse(409, "WALLET_NOT_READY");
      }
      return meFails ? errorResponse(500, "INTERNAL") : Response.json(me);
    },
  };
}

function errorResponse(status: number, code: string): Response {
  return Response.json(
    { error: { code, message: `Fake ${code}.`, requestId: "test-request" } },
    { status },
  );
}
