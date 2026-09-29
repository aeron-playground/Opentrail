import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { checkToken, MIN_LIQUIDITY_USD, mintForSymbol, seedEntryText } from "./token-check";

// Real answers from Jupiter's token search and Solana's getAccountInfo (public data).
const fixture = (name: string) =>
  Bun.file(join(import.meta.dir, "..", "test", "fixtures", "tokens", `${name}.json`)).json();

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL = "So11111111111111111111111111111111111111112";
const PYUSD = "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo";

type JupiterToken = Record<string, unknown>;
type ChainAnswer = {
  result: {
    value: null | {
      owner: string;
      data: { parsed: { type: string; info: Record<string, unknown> } };
    };
  };
};

// USDC's real answers, with one change for a refusal test.
async function usdc(
  changeJupiter: (token: JupiterToken) => void = () => {},
  changeChain: (answer: ChainAnswer) => void = () => {},
) {
  const jupiter = (await fixture("jupiter-usdc")) as JupiterToken[];
  const chain = (await fixture("chain-usdc")) as ChainAnswer;
  for (const token of jupiter) changeJupiter(token);
  changeChain(chain);
  return checkToken(USDC, jupiter, chain);
}

const problemsOf = (check: ReturnType<typeof checkToken>) => (check.ok ? [] : check.problems);

describe("checkToken on real answers", () => {
  test("accepts USDC, and reports its authorities from the chain", async () => {
    const check = checkToken(USDC, await fixture("jupiter-usdc"), await fixture("chain-usdc"));
    expect(check).toMatchObject({
      ok: true,
      entry: {
        mint: USDC,
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
        tokenProgram: "spl-token",
        logoUrl: expect.stringContaining(USDC),
      },
      mintAuthority: "BJE5MMbqXjVwjAF7oxwPYXnTXDyspzZyt4vwenNw5ruG",
      freezeAuthority: "7dGbd2QZcCKcTndnHcTL8q7SMVXAkp688NTQYwrRCrar",
      extensions: [],
    });
  });

  test("accepts SOL, which nobody can mint or freeze", async () => {
    const check = checkToken(SOL, await fixture("jupiter-sol"), await fixture("chain-sol"));
    expect(check).toMatchObject({
      ok: true,
      entry: { symbol: "SOL", decimals: 9, tokenProgram: "spl-token" },
      mintAuthority: null,
      freezeAuthority: null,
    });
  });

  test("refuses PYUSD for the Token-2022 extensions that can take or block tokens", async () => {
    const check = checkToken(
      PYUSD,
      await fixture("jupiter-pyusd-search"),
      await fixture("chain-pyusd"),
    );
    expect(problemsOf(check)).toEqual([
      "It has Token-2022 extensions we don't accept: permanentDelegate, transferFeeConfig, " +
        "confidentialTransferMint, confidentialTransferFeeConfig, transferHook",
    ]);
  });

  test("accepts a Token-2022 token whose extensions are only harmless ones", async () => {
    // PYUSD's real answers, keeping only its name, logo and close-mint extensions.
    const chain = (await fixture("chain-pyusd")) as ChainAnswer;
    const info = chain.result.value?.data.parsed.info as { extensions: { extension: string }[] };
    info.extensions = info.extensions.filter(({ extension }) =>
      ["metadataPointer", "tokenMetadata", "mintCloseAuthority"].includes(extension),
    );
    const check = checkToken(PYUSD, await fixture("jupiter-pyusd-search"), chain);
    expect(check).toMatchObject({ ok: true, entry: { tokenProgram: "token-2022", decimals: 6 } });
  });
});

describe("checkToken refuses, from USDC's real answers with one change", () => {
  test("a token Jupiter hasn't verified", async () => {
    const check = await usdc((token) => {
      delete token.isVerified;
    });
    expect(problemsOf(check)).toEqual(["Jupiter hasn't verified it"]);
  });

  test("liquidity under $1M", async () => {
    const check = await usdc((token) => {
      token.liquidity = MIN_LIQUIDITY_USD - 1;
    });
    expect(problemsOf(check)).toEqual(["Its liquidity is $999,999, under $1M"]);
  });

  test("decimals the two sources disagree on", async () => {
    const check = await usdc((token) => {
      token.decimals = 9;
    });
    expect(problemsOf(check)).toEqual(["Jupiter says 9 decimals, Solana says 6"]);
  });

  test("a token program the two sources disagree on", async () => {
    const check = await usdc((token) => {
      token.tokenProgram = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
    });
    expect(problemsOf(check)).toEqual([
      "Jupiter says program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb, Solana says " +
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    ]);
  });

  test("an account no token program owns", async () => {
    const check = await usdc(
      (token) => {
        token.tokenProgram = "11111111111111111111111111111111";
      },
      (answer) => {
        if (answer.result.value) answer.result.value.owner = "11111111111111111111111111111111";
      },
    );
    expect(problemsOf(check)).toEqual([
      "It isn't owned by a token program, but by 11111111111111111111111111111111",
    ]);
  });

  test("an account that isn't a ready mint", async () => {
    const check = await usdc(undefined, (answer) => {
      if (answer.result.value) answer.result.value.data.parsed.info.isInitialized = false;
    });
    expect(problemsOf(check)).toEqual(["The account isn't a ready mint"]);
  });

  test("an address with no account", async () => {
    const check = await usdc(undefined, (answer) => {
      answer.result.value = null;
    });
    expect(problemsOf(check)).toEqual(["There's no account at this address on Solana"]);
  });

  test("every problem at once, not just the first", async () => {
    const check = await usdc((token) => {
      delete token.isVerified;
      token.liquidity = 10;
      token.decimals = 2;
    });
    expect(problemsOf(check)).toHaveLength(3);
  });
});

describe("checkToken refuses answers it can't use", () => {
  test("text that isn't a Solana address", async () => {
    expect(problemsOf(checkToken("not-a-mint", [], {}))).toEqual([
      "not-a-mint isn't a Solana address",
    ]);
  });

  test("a mint Jupiter's answer doesn't include", async () => {
    const check = checkToken(USDC, await fixture("jupiter-sol"), await fixture("chain-usdc"));
    expect(problemsOf(check)).toEqual(["Jupiter doesn't know this token"]);
  });

  test.each([
    [
      "Jupiter",
      { error: "rate limited" },
      "chain-usdc",
      "Jupiter answered in a shape we don't know",
    ],
    [
      "Solana",
      "jupiter-usdc",
      { error: { code: -32005 } },
      "Solana answered in a shape we don't know, or it isn't a mint",
    ],
  ])("an answer from %s in a shape it doesn't know", async (_, jupiter, chain, problem) => {
    const read = (value: unknown) => (typeof value === "string" ? fixture(value) : value);
    const check = checkToken(USDC, await read(jupiter), await read(chain));
    expect(problemsOf(check)).toEqual([problem]);
  });
});

describe("mintForSymbol", () => {
  test("picks the one verified PYUSD out of 20 results, copies included", async () => {
    expect(mintForSymbol("PYUSD", await fixture("jupiter-pyusd-search"))).toEqual({ mint: PYUSD });
  });

  test("ignores the case of the symbol", async () => {
    expect(mintForSymbol("pyusd", await fixture("jupiter-pyusd-search"))).toEqual({ mint: PYUSD });
  });

  test("finds nothing when no verified token has the symbol", async () => {
    // In the real results, the tokens called PYUSDX are all unverified.
    expect(mintForSymbol("PYUSDX", await fixture("jupiter-pyusd-search"))).toEqual({
      problem: "Jupiter has no verified token with the symbol PYUSDX",
    });
  });

  test("refuses to choose between two verified tokens with the same symbol", async () => {
    // The real results, with one copy marked verified.
    const results = (await fixture("jupiter-pyusd-search")) as JupiterToken[];
    const copy = results.find((token) => token.id !== PYUSD && token.symbol === "PYUSD");
    if (copy) copy.isVerified = true;
    const picked = mintForSymbol("PYUSD", results);
    const problem = "problem" in picked ? picked.problem : "";
    expect(problem).toContain("Several verified tokens use the symbol PYUSD");
    expect(problem).toContain(PYUSD);
  });

  test("refuses an answer in a shape it doesn't know", () => {
    expect(mintForSymbol("JUP", { error: "rate limited" })).toEqual({
      problem: "Jupiter answered in a shape we don't know",
    });
  });
});

test("seedEntryText prints the entry for the seed file", () => {
  expect(
    seedEntryText({
      mint: SOL,
      symbol: "SOL",
      name: "Wrapped SOL",
      decimals: 9,
      tokenProgram: "spl-token",
      logoUrl: null,
    }),
  ).toBe(
    [
      "  {",
      `    mint: "${SOL}",`,
      '    symbol: "SOL",',
      '    name: "Wrapped SOL",',
      "    decimals: 9,",
      '    tokenProgram: "spl-token",',
      "    logoUrl: null,",
      "  },",
    ].join("\n"),
  );
});
