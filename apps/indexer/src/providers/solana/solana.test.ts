import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createSolanaMints, MAX_ACCOUNTS_PER_CALL } from "./solana";

// Real mints (public data), in the order of the saved answer.
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL = "So11111111111111111111111111111111111111112";
const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const RAY = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R";
const JITOSOL = "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn";
const MSOL = "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So";
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
const ALL = [USDC, SOL, JUP, RAY, JITOSOL, MSOL, BONK, WIF];
// Made up for these tests: a provider address with a key in it.
const RPC_URL = "https://rpc.example.test/?api-key=test-key-0123";

// The chain's real answer for our 8 mints, 2026-10-01 (public data).
const realAnswer = () =>
  Bun.file(join(import.meta.dir, "..", "..", "..", "test", "fixtures", "solana-mints.json")).text();

const answerWith = (value: unknown[]) =>
  JSON.stringify({ jsonrpc: "2.0", id: 1, result: { value } });

function fakeServer(answers: (string | Response | Error)[]) {
  const requests: Request[] = [];
  const solana = createSolanaMints({
    rpcUrl: RPC_URL,
    fetch: async (request) => {
      requests.push(request);
      const answer = answers.shift() ?? new Error("The test gave no more answers");
      if (answer instanceof Error) throw answer;
      return typeof answer === "string" ? new Response(answer) : answer;
    },
  });
  return { solana, requests };
}

const mintAccount = (
  info: Record<string, unknown>,
  owner = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
) => ({
  owner,
  data: { parsed: { type: "mint", info } },
});

describe("getAuthorities", () => {
  test("reads the real answer: USDC keeps both, liquid staking tokens their mint authority", async () => {
    const { solana } = fakeServer([await realAnswer()]);

    const found = await solana.getAuthorities(ALL);

    expect(Object.fromEntries(found)).toEqual({
      [USDC]: { mintAuthorityRevoked: false, freezeAuthorityRevoked: false },
      [SOL]: { mintAuthorityRevoked: true, freezeAuthorityRevoked: true },
      [JUP]: { mintAuthorityRevoked: true, freezeAuthorityRevoked: true },
      [RAY]: { mintAuthorityRevoked: true, freezeAuthorityRevoked: true },
      [JITOSOL]: { mintAuthorityRevoked: false, freezeAuthorityRevoked: true },
      [MSOL]: { mintAuthorityRevoked: false, freezeAuthorityRevoked: true },
      [BONK]: { mintAuthorityRevoked: true, freezeAuthorityRevoked: true },
      [WIF]: { mintAuthorityRevoked: true, freezeAuthorityRevoked: true },
    });
  });

  test("asks for the accounts, parsed, at confirmed", async () => {
    const { solana, requests } = fakeServer([answerWith([null])]);
    await solana.getAuthorities([JUP]);
    expect(requests[0]?.method).toBe("POST");
    expect(await requests[0]?.json()).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "getMultipleAccounts",
      params: [[JUP], { encoding: "jsonParsed", commitment: "confirmed" }],
    });
  });

  test(`asks at most ${MAX_ACCOUNTS_PER_CALL} accounts a call`, async () => {
    const mints = Array.from({ length: MAX_ACCOUNTS_PER_CALL + 1 }, () => JUP);
    const { solana, requests } = fakeServer([answerWith([]), answerWith([])]);
    await solana.getAuthorities(mints);
    const sizes = await Promise.all(
      requests.map(
        async (request) => ((await request.json()) as { params: [string[]] }).params[0].length,
      ),
    );
    expect(sizes).toEqual([MAX_ACCOUNTS_PER_CALL, 1]);
  });

  test("leaves out an account that doesn't exist, isn't a mint, or isn't owned by a token program", async () => {
    const { solana } = fakeServer([
      answerWith([
        null,
        {
          owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          data: { parsed: { type: "account", info: {} } },
        },
        mintAccount({}, "11111111111111111111111111111111"),
        mintAccount({ mintAuthority: null }, "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
      ]),
    ]);
    const found = await solana.getAuthorities([USDC, SOL, JUP, RAY]);
    expect(Object.fromEntries(found)).toEqual({
      [RAY]: { mintAuthorityRevoked: true, freezeAuthorityRevoked: true },
    });
  });

  test.each([
    [
      "answers with an error status",
      new Response("", { status: 429 }),
      "The Solana server answered 429",
    ],
    [
      "answers a JSON-RPC error",
      JSON.stringify({ error: { code: -32005, message: "busy" } }),
      "The Solana server answered error -32005",
    ],
    ["answers in another shape", "{}", "The Solana server answered in a shape we don't know"],
    [
      "doesn't answer",
      new TypeError("network down"),
      "The Solana server didn't answer (TypeError)",
    ],
  ])("fails when the server %s, without showing its address", async (_, answer, message) => {
    const { solana } = fakeServer([answer]);
    const error = await solana.getAuthorities([JUP]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(message);
    expect((error as Error).message).not.toContain("test-key-0123");
  });
});
