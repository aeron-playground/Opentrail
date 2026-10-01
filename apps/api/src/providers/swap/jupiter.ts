import { parseDecimal, pow10 } from "@repo/pnl";
import { parseJsonKeepingNumbers, type RateLimit } from "@repo/server";
import { isSolanaAddress } from "@repo/solana";
import { AccountRole, address, getBase64Encoder, type Instruction } from "@solana/kit";
import { z } from "zod";
import { type SwapProvider, SwapProviderError, type SwapRequest, type SwapRoute } from "./types";

// With a key, Jupiter's API. Without one, its keyless address, which Jupiter plans to retire, so
// production sets a key.
const KEYED_URL = "https://api.jup.ag";
const KEYLESS_URL = "https://lite-api.jup.ag";
// A person waits on the quote.
const TIMEOUT_MS = 5_000;

const RAW_AMOUNT = z.string().regex(/^\d+$/);
const WHOLE_NUMBER = z.string().regex(/^\d+$/);
const ADDRESS = z.string().refine(isSolanaAddress);

// Numbers arrive as their original text (see parseJsonKeepingNumbers), so they're strings here.
const QuoteSchema = z.object({
  inputMint: z.string(),
  outputMint: z.string(),
  inAmount: RAW_AMOUNT,
  outAmount: RAW_AMOUNT,
  // The least the person may get after slippage.
  otherAmountThreshold: RAW_AMOUNT,
  swapMode: z.string(),
  slippageBps: WHOLE_NUMBER,
  // A fraction, despite the name: 0.0042 is 0.42% (checked against real quotes of two sizes).
  priceImpactPct: z.string().regex(/^-?\d+(\.\d+)?$/),
  platformFee: z.object({ feeBps: WHOLE_NUMBER }).nullish(),
  routePlan: z.array(z.object({ swapInfo: z.object({ label: z.string() }) })).min(1),
});

const JupiterInstruction = z.object({
  programId: ADDRESS,
  accounts: z.array(z.object({ pubkey: ADDRESS, isSigner: z.boolean(), isWritable: z.boolean() })),
  data: z.base64(),
});

// Jupiter also sends its own compute budget, priority fee and blockhash; the API sets its own.
const InstructionsSchema = z.object({
  setupInstructions: z.array(JupiterInstruction),
  otherInstructions: z.array(JupiterInstruction).nullish(),
  swapInstruction: JupiterInstruction,
  cleanupInstruction: JupiterInstruction.nullish(),
  addressLookupTableAddresses: z.array(ADDRESS),
});

const ErrorSchema = z.object({ errorCode: z.string() });

export type JupiterSwapsOptions = {
  apiKey?: string;
  // Shared by every Jupiter call in the API.
  rateLimit: RateLimit;
  // Tests answer in place of Jupiter.
  fetch?: (request: Request) => Promise<Response>;
};

export function createJupiterSwaps({
  apiKey,
  rateLimit,
  fetch: send = fetch,
}: JupiterSwapsOptions): SwapProvider {
  const base = apiKey ? KEYED_URL : KEYLESS_URL;
  // A header, never the address, so no error message can show the key.
  const headers: Record<string, string> = apiKey ? { "x-api-key": apiKey } : {};

  // One call through the shared rate limit. `what` names it in errors, which never show the
  // address or the key.
  async function call(path: string, what: string, init: RequestInit = {}): Promise<Response> {
    try {
      // Built inside the queue, so the timeout starts when the call does, not while it waits.
      return await rateLimit(() =>
        send(
          new Request(`${base}${path}`, {
            ...init,
            headers: { ...headers, ...init.headers },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          }),
        ),
      );
    } catch (error) {
      const name = error instanceof Error ? error.name : "Error";
      throw new SwapProviderError("unavailable", `Jupiter ${what} didn't answer (${name})`);
    }
  }

  async function readJson(response: Response, what: string): Promise<unknown> {
    try {
      return parseJsonKeepingNumbers(await response.text());
    } catch {
      throw new SwapProviderError(
        "unavailable",
        `Jupiter answered ${what} with something other than JSON`,
      );
    }
  }

  return {
    name: "jupiter",
    async getSwapInstructions(request) {
      const query = new URLSearchParams({
        inputMint: request.inputMint,
        outputMint: request.outputMint,
        amount: request.amountRaw.toString(),
        slippageBps: String(request.slippageBps),
        maxAccounts: String(request.maxAccounts),
      });
      const quoteResponse = await call(`/swap/v1/quote?${query}`, "the quote");
      // Kept as text: it goes back to Jupiter exactly as it came.
      const quoteText = await quoteResponse.text();
      if (!quoteResponse.ok) {
        throw quoteError(quoteResponse.status, quoteText);
      }
      const quote = readQuote(quoteText, request);

      const instructionsResponse = await call("/swap/v1/swap-instructions", "the instructions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: `{"quoteResponse":${quoteText},"userPublicKey":${JSON.stringify(request.userPublicKey)},"wrapAndUnwrapSol":true}`,
      });
      if (!instructionsResponse.ok) {
        throw new SwapProviderError(
          "unavailable",
          `Jupiter answered the instructions with ${instructionsResponse.status}`,
        );
      }
      const parsed = InstructionsSchema.safeParse(
        await readJson(instructionsResponse, "the instructions"),
      );
      if (!parsed.success) {
        throw new SwapProviderError(
          "unavailable",
          "Jupiter answered the instructions in a shape we don't know",
        );
      }
      const answer = parsed.data;
      const setup = [...answer.setupInstructions, ...(answer.otherInstructions ?? [])];
      const cleanup = answer.cleanupInstruction ? [answer.cleanupInstruction] : [];
      const all = [...setup, answer.swapInstruction, ...cleanup];
      // The person's wallet is the only signer the API checks for, so a route may not add another.
      const otherSigner = all.some((instruction) =>
        instruction.accounts.some(
          (account) => account.isSigner && account.pubkey !== request.userPublicKey,
        ),
      );
      if (otherSigner) {
        throw new SwapProviderError(
          "unavailable",
          "Jupiter's instructions ask someone other than the wallet to sign",
        );
      }

      return {
        ...quote,
        parts: {
          setup: setup.map(toInstruction),
          swap: toInstruction(answer.swapInstruction),
          cleanup: cleanup.map(toInstruction),
        },
        addressLookupTableAddresses: answer.addressLookupTableAddresses,
      };
    },
  };
}

// A 400 with an error code is Jupiter declining the trade (an untradable token, no route).
// Anything else is Jupiter having trouble.
function quoteError(status: number, text: string): SwapProviderError {
  if (status === 400) {
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      // Not JSON, so not Jupiter's error shape.
    }
    const parsed = ErrorSchema.safeParse(body);
    if (parsed.success) {
      return new SwapProviderError("no_route", `Jupiter has no route (${parsed.data.errorCode})`);
    }
  }
  return new SwapProviderError("unavailable", `Jupiter answered the quote with ${status}`);
}

type QuoteFields = Omit<SwapRoute, "parts" | "addressLookupTableAddresses">;

// The quote must be for exactly what was asked, so a mixed-up answer never reaches a person.
function readQuote(text: string, request: SwapRequest): QuoteFields {
  let json: unknown;
  try {
    json = parseJsonKeepingNumbers(text);
  } catch {
    throw new SwapProviderError(
      "unavailable",
      "Jupiter answered the quote with something other than JSON",
    );
  }
  const parsed = QuoteSchema.safeParse(json);
  if (!parsed.success) {
    throw new SwapProviderError(
      "unavailable",
      "Jupiter answered the quote in a shape we don't know",
    );
  }
  const quote = parsed.data;
  const expectedOutRaw = BigInt(quote.outAmount);
  const minOutRaw = BigInt(quote.otherAmountThreshold);
  const asked =
    quote.inputMint === request.inputMint &&
    quote.outputMint === request.outputMint &&
    quote.inAmount === request.amountRaw.toString() &&
    quote.slippageBps === String(request.slippageBps) &&
    quote.swapMode === "ExactIn" &&
    minOutRaw <= expectedOutRaw;
  if (!asked) {
    throw new SwapProviderError(
      "unavailable",
      "Jupiter quoted something other than what was asked",
    );
  }
  return {
    expectedOutRaw,
    minOutRaw,
    priceImpactBps: impactBps(quote.priceImpactPct),
    routeLabel: [...new Set(quote.routePlan.map((step) => step.swapInfo.label))].join(" → "),
    providerFeeBps: quote.platformFee ? Number(quote.platformFee.feeBps) : 0,
  };
}

// A fraction to basis points, rounded up. A negative impact (a better price than the market) is none.
function impactBps(fraction: string): number {
  if (fraction.startsWith("-")) {
    return 0;
  }
  const { digits, scale } = parseDecimal(fraction);
  const divisor = pow10(scale);
  return Number((digits * 10_000n + divisor - 1n) / divisor);
}

function toInstruction(instruction: z.infer<typeof JupiterInstruction>): Instruction {
  return {
    programAddress: address(instruction.programId),
    accounts: instruction.accounts.map((account) => ({
      address: address(account.pubkey),
      role: account.isSigner
        ? account.isWritable
          ? AccountRole.WRITABLE_SIGNER
          : AccountRole.READONLY_SIGNER
        : account.isWritable
          ? AccountRole.WRITABLE
          : AccountRole.READONLY,
    })),
    data: getBase64Encoder().encode(instruction.data),
  };
}
