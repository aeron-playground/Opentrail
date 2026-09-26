import { z } from "zod";
import type { HeliusWebhooks } from "./types";

const BASE_URL = "https://mainnet.helius-rpc.com/v0/webhooks";
// Helius's limit for one webhook.
export const MAX_WEBHOOK_ADDRESSES = 100_000;
const TIMEOUT_MS = 10_000;

// The settings an edit can carry. An edit sends back every one of them as it was read, with only
// the addresses changed: Helius's docs don't promise that a setting left out is kept, and losing
// the auth header would make every delivery fail our secret check.
// Helius may answer null for a setting that was never set; sending null back could clear it. As
// undefined, JSON leaves it out instead.
const orUndefined = <T>(value: T | null | undefined): T | undefined => value ?? undefined;
const WebhookSchema = z.object({
  webhookURL: z.string(),
  webhookType: z.string(),
  accountAddresses: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? []),
  transactionTypes: z.array(z.string()).nullish().transform(orUndefined),
  authHeader: z.string().nullish().transform(orUndefined),
  encoding: z.string().nullish().transform(orUndefined),
  txnStatus: z.string().nullish().transform(orUndefined),
});
type Webhook = z.infer<typeof WebhookSchema>;

export type HeliusOptions = {
  apiKey: string;
  webhookId: string;
  // Tests answer in place of Helius.
  fetch?: (request: Request) => Promise<Response>;
};

export function createHeliusWebhooks({
  apiKey,
  webhookId,
  fetch: send = fetch,
}: HeliusOptions): HeliusWebhooks {
  // Carries the API key, so it never goes into an error, a log line or a thrown message.
  const url = `${BASE_URL}/${encodeURIComponent(webhookId)}?api-key=${encodeURIComponent(apiKey)}`;

  async function call(method: "GET" | "PUT", body?: Webhook): Promise<unknown> {
    const request = new Request(url, {
      method,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...(body && {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    });
    let response: Response;
    try {
      response = await send(request);
    } catch (error) {
      // A network error can quote the URL; only its name goes on.
      const name = error instanceof Error ? error.name : "Error";
      throw new Error(`Helius webhook ${method} didn't get an answer (${name})`);
    }
    if (!response.ok) {
      throw new Error(`Helius webhook ${method} answered ${response.status}`);
    }
    return response.json();
  }

  return {
    async addAddresses(addresses) {
      const read = WebhookSchema.safeParse(await call("GET"));
      if (!read.success) {
        throw new Error("Helius answered with a webhook in a shape we don't know");
      }
      const webhook = read.data;
      // Our deliveries are read as raw RPC transactions; any other type would fail every one.
      if (webhook.webhookType !== "raw") {
        throw new Error(`The Helius webhook must be of type raw, not ${webhook.webhookType}`);
      }
      const watched = new Set(webhook.accountAddresses);
      const missing = [...new Set(addresses)].filter((address) => !watched.has(address));
      if (missing.length === 0) {
        return watched.size;
      }
      const accountAddresses = [...webhook.accountAddresses, ...missing];
      if (accountAddresses.length > MAX_WEBHOOK_ADDRESSES) {
        throw new Error(
          `The Helius webhook would watch ${accountAddresses.length} addresses, over its limit of ${MAX_WEBHOOK_ADDRESSES}`,
        );
      }
      await call("PUT", { ...webhook, accountAddresses });
      return accountAddresses.length;
    },
  };
}
