// Saves a real mainnet transaction as a test fixture for the indexer:
//   bun scripts/capture-tx.ts <signature> [name]
// The file is test/fixtures/<name>.json; name it after what it shows, such as deposit-usdc.
// It's public on-chain data, shaped like one transaction in a Helius "raw" webhook delivery
// (an RPC getTransaction result). Set SOLANA_RPC_URL to use a provider instead of the public server.
import { join } from "node:path";
import { SIGNATURE, unsafeNumberPath } from "./lib/capture";

const signature = process.argv[2] ?? "";
const name = process.argv[3] ?? signature;
if (!SIGNATURE.test(signature) || !/^[a-z0-9-]+$|^[1-9A-HJ-NP-Za-km-z]+$/.test(name)) {
  console.error(
    "Usage: bun scripts/capture-tx.ts <transaction signature> [name, like deposit-usdc]",
  );
  process.exit(1);
}

const url = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const response = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "getTransaction",
    params: [
      signature,
      { encoding: "json", maxSupportedTransactionVersion: 1, commitment: "confirmed" },
    ],
  }),
});
const body = (await response.json()) as { result?: unknown; error?: { message: string } };
if (body.error || !body.result) {
  console.error(`Couldn't fetch ${signature}: ${body.error?.message ?? "no such transaction"}`);
  process.exit(1);
}
const unsafe = unsafeNumberPath(body.result);
if (unsafe) {
  console.error(`${unsafe} is too large to store exactly in JSON. Pick another transaction.`);
  process.exit(1);
}

const path = join(
  import.meta.dir,
  "..",
  "apps",
  "indexer",
  "test",
  "fixtures",
  `${signature}.json`,
);
await Bun.write(path, `${JSON.stringify(body.result, null, 2)}\n`);
console.log(`Saved ${path}`);
