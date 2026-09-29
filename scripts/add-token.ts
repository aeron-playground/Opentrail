// Checks tokens before they join the list: Jupiter's token data and each mint's own account on
// Solana must agree (the rules are in lib/token-check.ts). Prints each checked entry for
// packages/db/src/seed/tokens.ts, or every problem found.
//   bun scripts/add-token.ts <symbol or mint> [<symbol or mint> ...]
// JUPITER_API_KEY (optional) uses Jupiter's keyed API. SOLANA_RPC_URL picks the Solana server.
import { isSolanaAddress } from "@repo/solana";
import { checkToken, mintForSymbol, seedEntryText, type TokenCheck } from "./lib/token-check";

// Jupiter's free plan allows one request a second.
const JUPITER_GAP_MS = 1_100;
const TIMEOUT_MS = 15_000;

const queries = Bun.argv.slice(2);
if (queries.length === 0) {
  console.error("Usage: bun scripts/add-token.ts <symbol or mint> [<symbol or mint> ...]");
  process.exit(2);
}

const apiKey = process.env.JUPITER_API_KEY;
const jupiterUrl = apiKey ? "https://api.jup.ag" : "https://lite-api.jup.ag";
// May carry a provider's key, so it's never printed.
const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

let lastJupiterCall = 0;

async function searchJupiter(query: string): Promise<unknown> {
  await Bun.sleep(Math.max(0, lastJupiterCall + JUPITER_GAP_MS - Date.now()));
  lastJupiterCall = Date.now();
  // The key goes in a header, never in the address, so no error message can show it.
  const response = await send("Jupiter", `${jupiterUrl}/tokens/v2/search?query=${query}`, {
    headers: apiKey ? { "x-api-key": apiKey } : {},
  });
  return response.json();
}

async function readMint(mint: string): Promise<unknown> {
  const response = await send("Solana", rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [mint, { encoding: "jsonParsed", commitment: "confirmed" }],
    }),
  });
  return response.json();
}

async function send(service: string, url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    // A network error can quote the address; only its kind goes on.
    throw new Error(`${service} didn't answer (${error instanceof Error ? error.name : "Error"})`);
  }
  if (!response.ok) {
    throw new Error(`${service} answered ${response.status}`);
  }
  return response;
}

async function check(query: string): Promise<{ mint: string; result: TokenCheck }> {
  const jupiter = await searchJupiter(encodeURIComponent(query));
  if (isSolanaAddress(query)) {
    return { mint: query, result: checkToken(query, jupiter, await readMint(query)) };
  }
  // A symbol: only a single Jupiter-verified match counts, never the first of many.
  const picked = mintForSymbol(query, jupiter);
  if ("problem" in picked) {
    return { mint: "-", result: { ok: false, problems: [picked.problem] } };
  }
  return {
    mint: picked.mint,
    result: checkToken(picked.mint, jupiter, await readMint(picked.mint)),
  };
}

const describeAuthority = (address: string | null) => address ?? "none";
let refused = 0;

for (const query of queries) {
  let outcome: { mint: string; result: TokenCheck };
  try {
    outcome = await check(query);
  } catch (error) {
    outcome = {
      mint: "-",
      result: { ok: false, problems: [error instanceof Error ? error.message : String(error)] },
    };
  }
  const { mint, result } = outcome;
  if (!result.ok) {
    refused += 1;
    console.log(`✗ ${query} (${mint})`);
    for (const problem of result.problems) console.log(`    - ${problem}`);
    continue;
  }
  const { entry } = result;
  console.log(`✓ ${entry.symbol} (${entry.name})`);
  console.log(`    ${entry.decimals} decimals, ${entry.tokenProgram}, verified by Jupiter`);
  console.log(`    liquidity $${Math.round(result.liquidityUsd).toLocaleString("en-US")}`);
  console.log(`    mint authority: ${describeAuthority(result.mintAuthority)}`);
  console.log(`    freeze authority: ${describeAuthority(result.freezeAuthority)}`);
  console.log(`    extensions: ${result.extensions.join(", ") || "none"}`);
  console.log(seedEntryText(entry));
}

if (refused > 0) {
  console.log(`\n${refused} of ${queries.length} refused.`);
  process.exit(1);
}
