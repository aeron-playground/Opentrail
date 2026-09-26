import type { Me } from "../features/account/use-me";
import { FAKE_TOKEN } from "./fake-auth";

export const FAKE_ME: Me = {
  id: "0192b6f0-7c1e-7a3b-9d7e-3f5c1a2b4d6e",
  username: "calm_otter_42",
  usernameChosen: false,
  usernameChangeableAt: null,
  // Not a real address: the pages in these tests never use it.
  walletAddress: "FakeWalletAddressForTests",
  createdAt: "2026-09-26T10:00:00.000Z",
};

export type FakeApi = {
  fetch: (request: Request) => Promise<Response>;
  requests: Request[];
};

type FakeApiOptions = {
  me?: Me;
  // How many times /v1/me answers WALLET_NOT_READY before it answers with the account.
  walletNotReadyTimes?: number;
  meFails?: boolean;
};

// Answers like the real API, for the routes the web app calls. No network.
export function createFakeApi({
  me = FAKE_ME,
  walletNotReadyTimes = 0,
  meFails = false,
}: FakeApiOptions = {}): FakeApi {
  let notReady = walletNotReadyTimes;
  const requests: Request[] = [];
  return {
    requests,
    fetch: async (request) => {
      requests.push(request);
      const { pathname } = new URL(request.url);
      if (request.method === "GET" && pathname === "/v1/me") {
        if (request.headers.get("authorization") !== `Bearer ${FAKE_TOKEN}`) {
          return errorResponse(401, "UNAUTHORIZED");
        }
        if (notReady > 0) {
          notReady -= 1;
          return errorResponse(409, "WALLET_NOT_READY");
        }
        return meFails ? errorResponse(500, "INTERNAL") : Response.json(me);
      }
      return errorResponse(404, "NOT_FOUND");
    },
  };
}

function errorResponse(status: number, code: string): Response {
  return Response.json(
    { error: { code, message: `Fake ${code}.`, requestId: "test-request" } },
    { status },
  );
}
