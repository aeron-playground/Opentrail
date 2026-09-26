import { describe, expect, test } from "bun:test";
import { USDC } from "@repo/solana";
import { getAddressDecoder, type RpcTransport } from "@solana/kit";
import { createSolanaReader } from "./rpc";

// A made-up owner: 32 fixed bytes, so a valid address that belongs to nobody we know.
const OWNER = getAddressDecoder().decode(new Uint8Array(32).fill(7));

type Payload = { method: string; params: unknown[] };

// Answers every request with `answer`, like a Solana server would, and keeps the requests.
function fakeServer(answer: { result?: unknown; error?: { code: number; message: string } }) {
  const payloads: Payload[] = [];
  const transport = (async ({ payload }: { payload: unknown }) => {
    payloads.push(payload as Payload);
    return { jsonrpc: "2.0", id: (payload as { id: unknown }).id, ...answer };
  }) as RpcTransport;
  return { reader: createSolanaReader({ transport }), payloads };
}

const tokenAccount = (amount: string) => ({
  pubkey: getAddressDecoder().decode(crypto.getRandomValues(new Uint8Array(32))),
  account: { data: { parsed: { info: { tokenAmount: { amount } } } } },
});

describe("getSolBalance", () => {
  test("reads the lamports at 'confirmed'", async () => {
    const { reader, payloads } = fakeServer({
      result: { context: { slot: 1 }, value: 20_000_000 },
    });

    expect(await reader.getSolBalance(OWNER)).toBe(20_000_000n);
    expect(payloads[0]).toMatchObject({
      method: "getBalance",
      params: [OWNER, { commitment: "confirmed" }],
    });
  });

  test("keeps every lamport of a balance too big for a JavaScript number", async () => {
    const huge = 9_007_199_254_740_993n; // 2^53 + 1
    const { reader } = fakeServer({ result: { context: { slot: 1 }, value: huge } });
    expect(await reader.getSolBalance(OWNER)).toBe(huge);
  });

  test("passes a server error on", async () => {
    const { reader } = fakeServer({ error: { code: -32005, message: "Node is behind" } });
    await expect(reader.getSolBalance(OWNER)).rejects.toThrow();
  });
});

describe("getTokenBalance", () => {
  test("adds up every account of that token, at 'confirmed'", async () => {
    const { reader, payloads } = fakeServer({
      result: { context: { slot: 1 }, value: [tokenAccount("50000000"), tokenAccount("1500000")] },
    });

    expect(await reader.getTokenBalance(OWNER, USDC.mint)).toBe(51_500_000n);
    expect(payloads[0]).toMatchObject({
      method: "getTokenAccountsByOwner",
      params: [OWNER, { mint: USDC.mint }, { encoding: "jsonParsed", commitment: "confirmed" }],
    });
  });

  test("is 0 when the owner has no account for the token", async () => {
    const { reader } = fakeServer({ result: { context: { slot: 1 }, value: [] } });
    expect(await reader.getTokenBalance(OWNER, USDC.mint)).toBe(0n);
  });

  test.each([
    ["an amount that isn't a whole number", [tokenAccount("1.5")]],
    ["an account without parsed data", [{ account: { data: ["AAAA", "base64"] } }]],
  ])("refuses %s", async (_, value) => {
    const { reader } = fakeServer({ result: { context: { slot: 1 }, value } });
    await expect(reader.getTokenBalance(OWNER, USDC.mint)).rejects.toThrow();
  });
});

test("refuses an owner that isn't a Solana address, before asking the server", async () => {
  const { reader, payloads } = fakeServer({ result: { context: { slot: 1 }, value: 0 } });
  await expect(reader.getSolBalance("not-an-address")).rejects.toThrow();
  expect(payloads).toHaveLength(0);
});
