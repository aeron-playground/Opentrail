import { describe, expect, test } from "bun:test";
import { createHeliusWebhooks, MAX_WEBHOOK_ADDRESSES } from "./helius";

// Made up for these tests: no real key, webhook or wallet.
const API_KEY = "test-api-key-0123";
const WEBHOOK_ID = "test-webhook-id";
const [A, B, C] = ["MadeUpAddressA", "MadeUpAddressB", "MadeUpAddressC"];

const webhook = {
  webhookID: WEBHOOK_ID,
  wallet: "MadeUpOwnerWallet",
  webhookURL: "https://indexer.example.com/webhooks/helius",
  webhookType: "raw",
  transactionTypes: ["ANY"],
  accountAddresses: [A],
  authHeader: "made-up-webhook-secret",
  txnStatus: "all",
  encoding: null,
  active: true,
};

type Answer = Response | Error;

// Answers in order, like Helius would, and keeps each request with its body.
function fakeHelius(...answers: Answer[]) {
  const requests: { method: string; url: string; body: unknown }[] = [];
  const helius = createHeliusWebhooks({
    apiKey: API_KEY,
    webhookId: WEBHOOK_ID,
    fetch: async (request) => {
      requests.push({
        method: request.method,
        url: request.url,
        body: request.method === "PUT" ? await request.json() : undefined,
      });
      const answer = answers.shift() ?? new Error("The test gave no more answers");
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    },
  });
  return { helius, requests };
}

describe("addAddresses", () => {
  test("adds the new addresses and sends every other setting back unchanged", async () => {
    const { helius, requests } = fakeHelius(Response.json(webhook), Response.json({}));

    expect(await helius.addAddresses([B, A, C, B])).toBe(3);

    expect(requests.map(({ method, url }) => [method, url])).toEqual([
      ["GET", `https://mainnet.helius-rpc.com/v0/webhooks/${WEBHOOK_ID}?api-key=${API_KEY}`],
      ["PUT", `https://mainnet.helius-rpc.com/v0/webhooks/${WEBHOOK_ID}?api-key=${API_KEY}`],
    ]);
    // Only settings an edit takes, and none that came back null.
    expect(requests[1]?.body).toEqual({
      webhookURL: webhook.webhookURL,
      webhookType: "raw",
      transactionTypes: ["ANY"],
      accountAddresses: [A, B, C],
      authHeader: "made-up-webhook-secret",
      txnStatus: "all",
    });
  });

  test("edits nothing when every address is already watched", async () => {
    const { helius, requests } = fakeHelius(Response.json(webhook));
    expect(await helius.addAddresses([A])).toBe(1);
    expect(requests.map(({ method }) => method)).toEqual(["GET"]);
  });

  test("starts a watch list on a webhook that has none", async () => {
    const { helius, requests } = fakeHelius(
      Response.json({ ...webhook, accountAddresses: null }),
      Response.json({}),
    );
    expect(await helius.addAddresses([B])).toBe(1);
    expect(requests[1]?.body).toMatchObject({ accountAddresses: [B] });
  });

  test("refuses to go over Helius's limit", async () => {
    const full = Array.from({ length: MAX_WEBHOOK_ADDRESSES }, (_, index) => `MadeUp${index}`);
    const { helius, requests } = fakeHelius(Response.json({ ...webhook, accountAddresses: full }));
    await expect(helius.addAddresses([B])).rejects.toThrow("over its limit");
    expect(requests).toHaveLength(1);
  });

  test("refuses a webhook that isn't raw, since its deliveries couldn't be read", async () => {
    const { helius } = fakeHelius(Response.json({ ...webhook, webhookType: "enhanced" }));
    await expect(helius.addAddresses([B])).rejects.toThrow("must be of type raw, not enhanced");
  });

  test("refuses an answer in a shape it doesn't know", async () => {
    const { helius } = fakeHelius(Response.json({ hello: "world" }));
    await expect(helius.addAddresses([B])).rejects.toThrow("a shape we don't know");
  });

  const failures: [string, Answer[], string][] = [
    ["a refused read", [new Response("{}", { status: 401 })], "GET answered 401"],
    [
      "a refused edit",
      [Response.json(webhook), new Response("{}", { status: 429 })],
      "PUT answered 429",
    ],
    [
      "no answer at all",
      [new Error(`Unable to connect to https://mainnet.helius-rpc.com/?api-key=${API_KEY}`)],
      "didn't get an answer (Error)",
    ],
  ];

  test.each(failures)("reports %s without the API key", async (_, answers, message) => {
    const { helius } = fakeHelius(...answers);
    const error = await helius.addAddresses([B]).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(message);
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(API_KEY);
  });
});
