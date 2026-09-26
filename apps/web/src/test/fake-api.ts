import { normalizeUsername, USERNAME_CHANGE_DAYS, usernameProblem } from "@repo/shared";
import type { Me } from "../features/account/use-me";
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

export type FakeApi = {
  fetch: (request: Request) => Promise<Response>;
  requests: Request[];
  me: () => Me;
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
};

// Answers like the real API, for the routes the web app calls. No network.
export function createFakeApi({
  me: initialMe = FAKE_ME,
  walletNotReadyTimes = 0,
  meFails = false,
  taken = [],
  suggestions = ["brave_heron_07", "keen_lynx_11"],
  suggestFails = false,
}: FakeApiOptions = {}): FakeApi {
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
