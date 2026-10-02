import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { USDC } from "@repo/solana";
import { address, type Blockhash, getAddressDecoder, type RpcTransport } from "@solana/kit";
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

describe("getTokenAccount", () => {
  // Trimmed from a real jsonParsed answer for a USDC account.
  const usdcAccount = (state: string, program = "spl-token") => ({
    data: {
      program,
      parsed: {
        type: "account",
        info: { mint: USDC.mint, owner: OWNER, state, tokenAmount: { amount: "0", decimals: 6 } },
      },
      space: 165,
    },
    executable: false,
    lamports: 2_039_280,
    owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    space: 165,
  });

  test("reads the token, owner and state of a token account, at 'confirmed'", async () => {
    const { reader, payloads } = fakeServer({
      result: { context: { slot: 1 }, value: usdcAccount("initialized") },
    });
    expect(await reader.getTokenAccount(OWNER)).toEqual({
      mint: USDC.mint,
      owner: OWNER,
      frozen: false,
    });
    expect(payloads[0]).toMatchObject({
      method: "getAccountInfo",
      params: [OWNER, { encoding: "jsonParsed", commitment: "confirmed" }],
    });
  });

  test.each([
    ["a frozen account", usdcAccount("frozen"), { mint: USDC.mint, owner: OWNER, frozen: true }],
    [
      "a Token-2022 account",
      usdcAccount("initialized", "spl-token-2022"),
      { mint: USDC.mint, owner: OWNER, frozen: false },
    ],
    ["no account at all", null, null],
    [
      "a wallet, not a token account",
      { data: ["", "base64"], owner: "11111111111111111111111111111111" },
      null,
    ],
    [
      "a mint, not a token account",
      { data: { program: "spl-token", parsed: { type: "mint", info: {} } } },
      null,
    ],
  ])("reads %s", async (_, value, expected) => {
    const { reader } = fakeServer({ result: { context: { slot: 1 }, value } });
    expect(await reader.getTokenAccount(OWNER)).toEqual(expected);
  });
});

describe("getLatestBlockhash", () => {
  test("reads the newest blockhash and its last valid block height, at 'confirmed'", async () => {
    const blockhash = "4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM" as Blockhash;
    const { reader, payloads } = fakeServer({
      result: { context: { slot: 1 }, value: { blockhash, lastValidBlockHeight: 431_000_150 } },
    });
    expect(await reader.getLatestBlockhash()).toEqual({
      blockhash,
      lastValidBlockHeight: 431_000_150n,
    });
    expect(payloads[0]).toMatchObject({
      method: "getLatestBlockhash",
      params: [{ commitment: "confirmed" }],
    });
  });
});

// A real answer from mainnet for a table Jupiter used in the saved buy (public data).
const answer = (await Bun.file(
  join(import.meta.dir, "..", "..", "..", "test", "fixtures", "solana-lookup-table.json"),
).json()) as { result: { value: [{ data: { parsed: { info: { addresses: string[] } } } }] } };
const TABLE = "An5DxTxrK1Uc3gaMZNvrTajbdXfZpyqLNRSuf3DDSBKU";

describe("getLookupTables", () => {
  test("reads each table's addresses from the chain, in order", async () => {
    const { reader, payloads } = fakeServer({ result: answer.result });
    const tables = await reader.getLookupTables([TABLE]);
    const expected = answer.result.value[0].data.parsed.info.addresses;
    expect(tables[address(TABLE)]).toEqual(expected.map(address));
    expect(expected).toHaveLength(240);
    expect(payloads[0]).toMatchObject({ method: "getMultipleAccounts" });
  });

  test("refuses a table that doesn't exist", async () => {
    const { reader } = fakeServer({ result: { context: { slot: 1 }, value: [null] } });
    await expect(reader.getLookupTables([TABLE])).rejects.toThrow();
  });
});

describe("simulate", () => {
  const TRANSACTION = "AQID";

  test("runs the transaction unsigned, with a fresh blockhash, and reads the units it used", async () => {
    const { reader, payloads } = fakeServer({
      result: {
        context: { slot: 1 },
        value: { err: null, logs: ["Program log: Instruction: Route"], unitsConsumed: 48_268 },
      },
    });
    expect(await reader.simulate(TRANSACTION)).toEqual({
      error: null,
      unitsConsumed: 48_268n,
      logs: ["Program log: Instruction: Route"],
    });
    expect(payloads[0]).toMatchObject({
      method: "simulateTransaction",
      params: [
        TRANSACTION,
        {
          encoding: "base64",
          sigVerify: false,
          replaceRecentBlockhash: true,
          commitment: "confirmed",
        },
      ],
    });
  });

  test("passes Solana's error on as it came, with the logs", async () => {
    const err = { InstructionError: [3, { Custom: 6024 }] };
    const { reader } = fakeServer({
      result: { context: { slot: 1 }, value: { err, logs: null, unitsConsumed: null } },
    });
    // Kit reads every number in the answer as a bigint, the error's included.
    expect(await reader.simulate(TRANSACTION)).toEqual({
      error: { InstructionError: [3n, { Custom: 6024n }] },
      unitsConsumed: null,
      logs: [],
    });
  });
});

describe("getRecentPriorityFees", () => {
  test("reads the fee of each recent slot for the given accounts", async () => {
    const { reader, payloads } = fakeServer({
      result: [
        { slot: 1, prioritizationFee: 0 },
        { slot: 2, prioritizationFee: 300_000 },
      ],
    });
    expect(await reader.getRecentPriorityFees([OWNER])).toEqual([0n, 300_000n]);
    expect(payloads[0]).toMatchObject({ method: "getRecentPrioritizationFees", params: [[OWNER]] });
  });

  test("refuses more accounts than Solana takes, before asking", async () => {
    const { reader, payloads } = fakeServer({ result: [] });
    await expect(reader.getRecentPriorityFees(Array(129).fill(OWNER))).rejects.toThrow(RangeError);
    expect(payloads).toHaveLength(0);
  });
});

test("refuses an owner that isn't a Solana address, before asking the server", async () => {
  const { reader, payloads } = fakeServer({ result: { context: { slot: 1 }, value: 0 } });
  await expect(reader.getSolBalance("not-an-address")).rejects.toThrow();
  expect(payloads).toHaveLength(0);
});
