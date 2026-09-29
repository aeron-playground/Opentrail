// The checks behind add-token.ts, kept apart so they can be tested without the network. A token
// joins the list only when Jupiter's token data and the mint's own account on Solana agree.
import { isSolanaAddress, type TokenProgram, tokenProgramAt } from "@repo/solana";
import { z } from "zod";

// The spec's bar for a listed token.
export const MIN_LIQUIDITY_USD = 1_000_000;

// Token-2022 extensions that can't hurt a holder: the token's name and logo record, grouping,
// and closing the mint once no tokens exist. Any other extension can move, tax, freeze or block
// holders' tokens, or is one we haven't reviewed, so the token is refused for a person to judge.
const HARMLESS_EXTENSIONS = new Set([
  "metadataPointer",
  "tokenMetadata",
  "groupPointer",
  "groupMemberPointer",
  "tokenGroup",
  "tokenGroupMember",
  "mintCloseAuthority",
]);

// Jupiter's token search answer, only the fields the checks read. Jupiter leaves a field out
// rather than send null or false, so most are optional.
const JupiterTokenSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  symbol: z.string().min(1),
  icon: z.string().optional(),
  decimals: z.number().int(),
  tokenProgram: z.string(),
  liquidity: z.number().optional(),
  isVerified: z.boolean().optional(),
});
const JupiterSearchSchema = z.array(JupiterTokenSchema);
type JupiterToken = z.infer<typeof JupiterTokenSchema>;

// getAccountInfo with jsonParsed encoding, for a mint account.
const ChainMintSchema = z.object({
  result: z.object({
    value: z
      .object({
        owner: z.string(),
        data: z.object({
          parsed: z.object({
            type: z.string(),
            info: z.object({
              decimals: z.number().int(),
              isInitialized: z.boolean(),
              mintAuthority: z.string().nullable(),
              freezeAuthority: z.string().nullable(),
              extensions: z.array(z.object({ extension: z.string() })).optional(),
            }),
          }),
        }),
      })
      .nullable(),
  }),
});

/** What the seed file keeps for a token. */
export type SeedEntry = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  tokenProgram: TokenProgram;
  logoUrl: string | null;
};

export type TokenCheck =
  | {
      ok: true;
      entry: SeedEntry;
      // For the person reading the output; the seed doesn't keep them.
      liquidityUsd: number;
      mintAuthority: string | null;
      freezeAuthority: string | null;
      extensions: string[];
    }
  | { ok: false; problems: string[] };

/** The mint of the one Jupiter-verified token with this symbol, or the problem. */
export function mintForSymbol(
  symbol: string,
  jupiterAnswer: unknown,
): { mint: string } | { problem: string } {
  const parsed = JupiterSearchSchema.safeParse(jupiterAnswer);
  if (!parsed.success) {
    return { problem: "Jupiter answered in a shape we don't know" };
  }
  const matches = parsed.data.filter(
    (token) => token.isVerified === true && token.symbol.toLowerCase() === symbol.toLowerCase(),
  );
  const [only, ...others] = matches;
  if (only === undefined) {
    return { problem: `Jupiter has no verified token with the symbol ${symbol}` };
  }
  if (others.length > 0) {
    const mints = matches.map((token) => `${token.id} (${token.name})`).join(", ");
    return { problem: `Several verified tokens use the symbol ${symbol}: ${mints}. Pass the mint` };
  }
  return { mint: only.id };
}

export function checkToken(mint: string, jupiterAnswer: unknown, chainAnswer: unknown): TokenCheck {
  if (!isSolanaAddress(mint)) {
    return { ok: false, problems: [`${mint} isn't a Solana address`] };
  }
  const jupiter = JupiterSearchSchema.safeParse(jupiterAnswer);
  const chain = ChainMintSchema.safeParse(chainAnswer);
  if (!jupiter.success) {
    return { ok: false, problems: ["Jupiter answered in a shape we don't know"] };
  }
  if (!chain.success) {
    return {
      ok: false,
      problems: ["Solana answered in a shape we don't know, or it isn't a mint"],
    };
  }
  const listed = jupiter.data.find((token) => token.id === mint);
  const account = chain.data.result.value;
  if (listed === undefined) {
    return { ok: false, problems: ["Jupiter doesn't know this token"] };
  }
  if (account === null) {
    return { ok: false, problems: ["There's no account at this address on Solana"] };
  }

  const problems = jupiterProblems(listed);
  const program = tokenProgramAt(account.owner);
  const { type, info } = account.data.parsed;
  if (program === null) {
    problems.push(`It isn't owned by a token program, but by ${account.owner}`);
  }
  if (type !== "mint" || !info.isInitialized) {
    problems.push("The account isn't a ready mint");
  }
  if (listed.tokenProgram !== account.owner) {
    problems.push(`Jupiter says program ${listed.tokenProgram}, Solana says ${account.owner}`);
  }
  if (listed.decimals !== info.decimals) {
    problems.push(`Jupiter says ${listed.decimals} decimals, Solana says ${info.decimals}`);
  }
  const extensions = (info.extensions ?? []).map(({ extension }) => extension);
  const risky = extensions.filter((extension) => !HARMLESS_EXTENSIONS.has(extension));
  if (risky.length > 0) {
    problems.push(`It has Token-2022 extensions we don't accept: ${risky.join(", ")}`);
  }

  if (problems.length > 0 || program === null) {
    return { ok: false, problems };
  }
  return {
    ok: true,
    entry: {
      mint,
      symbol: listed.symbol,
      name: listed.name,
      decimals: info.decimals,
      tokenProgram: program,
      logoUrl: listed.icon ?? null,
    },
    liquidityUsd: listed.liquidity ?? 0,
    mintAuthority: info.mintAuthority,
    freezeAuthority: info.freezeAuthority,
    extensions,
  };
}

function jupiterProblems(token: JupiterToken): string[] {
  const problems: string[] = [];
  if (token.isVerified !== true) {
    problems.push("Jupiter hasn't verified it");
  }
  const liquidity = token.liquidity ?? 0;
  if (liquidity < MIN_LIQUIDITY_USD) {
    problems.push(`Its liquidity is $${Math.round(liquidity).toLocaleString("en-US")}, under $1M`);
  }
  return problems;
}

/** The entry as it goes into packages/db/src/seed/tokens.ts. */
export function seedEntryText(entry: SeedEntry): string {
  return [
    "  {",
    `    mint: ${JSON.stringify(entry.mint)},`,
    `    symbol: ${JSON.stringify(entry.symbol)},`,
    `    name: ${JSON.stringify(entry.name)},`,
    `    decimals: ${entry.decimals},`,
    `    tokenProgram: ${JSON.stringify(entry.tokenProgram)},`,
    `    logoUrl: ${JSON.stringify(entry.logoUrl)},`,
    "  },",
  ].join("\n");
}
