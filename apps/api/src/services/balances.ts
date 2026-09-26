// Balances: what a wallet holds on Solana right now, read through a short cache.
import { type KnownToken, SOL, USDC } from "@repo/solana";
import type { SolanaReader } from "../providers/solana/types";

export type Balance = { token: KnownToken; amountRaw: bigint };
export type Balances = { balances: Balance[]; updatedAt: Date };

export type BalanceService = {
  /** USDC and SOL for the wallet, at most `ttlMs` old. */
  forWallet(address: string): Promise<Balances>;
};

export type BalanceServiceDeps = {
  solana: SolanaReader;
  now?: () => Date;
  // A screen polls every 5 s: many screens asking at once cost one read of Solana.
  ttlMs?: number;
  // Enough for every active wallet; the oldest entry goes first when it's full.
  maxWallets?: number;
};

export function createBalanceService({
  solana,
  now = () => new Date(),
  ttlMs = 5_000,
  maxWallets = 10_000,
}: BalanceServiceDeps): BalanceService {
  const cache = new Map<string, { at: number; balances: Promise<Balances> }>();

  async function read(address: string): Promise<Balances> {
    const [usdc, sol] = await Promise.all([
      solana.getTokenBalance(address, USDC.mint),
      solana.getSolBalance(address),
    ]);
    return {
      balances: [
        { token: USDC, amountRaw: usdc },
        { token: SOL, amountRaw: sol },
      ],
      updatedAt: now(),
    };
  }

  return {
    forWallet(address) {
      const at = now().getTime();
      const cached = cache.get(address);
      // A read in flight counts too, so two screens asking at once share it.
      if (cached && at - cached.at < ttlMs) {
        return cached.balances;
      }
      const balances = read(address);
      cache.delete(address);
      cache.set(address, { at, balances });
      if (cache.size > maxWallets) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) {
          cache.delete(oldest);
        }
      }
      // A failed read isn't kept: the next request tries Solana again.
      balances.catch(() => {
        if (cache.get(address)?.balances === balances) {
          cache.delete(address);
        }
      });
      return balances;
    },
  };
}
