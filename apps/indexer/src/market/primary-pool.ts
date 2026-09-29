// Which pool a token's chart comes from. Pure: no network, no database.
import { compareDecimals } from "@repo/pnl";
import { SOL, USDC } from "@repo/solana";
import type { Pool } from "../providers/geckoterminal/types";

// Tokens whose value we trust to price another one against.
const TRUSTED_PAIRS = new Set([USDC.mint, SOL.mint]);

/**
 * The address of the most liquid pool that pairs `mint` with USDC or SOL, or null when there's
 * none. A pool's liquidity counts both sides at their own prices, so the most liquid pool
 * overall can be full of an obscure token, and charting through it would trust that token.
 */
export function choosePrimaryPool(mint: string, pools: readonly Pool[]): string | null {
  let best: Pool | null = null;
  for (const pool of pools) {
    const other =
      pool.baseMint === mint ? pool.quoteMint : pool.quoteMint === mint ? pool.baseMint : null;
    if (other === null || other === mint || !TRUSTED_PAIRS.has(other)) {
      continue;
    }
    if (best === null || compareDecimals(pool.liquidityUsd, best.liquidityUsd) > 0) {
      best = pool;
    }
  }
  return best?.address ?? null;
}
