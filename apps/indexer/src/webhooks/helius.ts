import { AppError, type Logger, type RequestIdEnv } from "@repo/server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Inbox } from "../inbox";
import { secretsMatch } from "../lib/secret";

// Helius doesn't say how many transactions one delivery can hold, and a refused delivery is
// lost after three retries. So the limit is generous, and reaching it is logged as an error.
export const MAX_DELIVERY_BYTES = 10 * 1024 * 1024;

// A transaction signature: 64 bytes in base58.
const signature = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/);

// A "raw" webhook delivery: a list of transactions shaped like RPC getTransaction results.
// Only the signature is checked here. The whole transaction is stored for the processing job.
const deliverySchema = z.array(
  z.looseObject({
    transaction: z.looseObject({
      signatures: z.tuple([signature], signature),
    }),
  }),
);

export type HeliusWebhookDeps = {
  inbox: Inbox;
  logger: Logger;
  secret: string;
};

// Saves the delivery and answers at once: Helius wants a 200 within one second, and the
// processing job does the real work later.
export function heliusWebhook({ inbox, logger, secret }: HeliusWebhookDeps) {
  const app = new Hono<RequestIdEnv>();
  app.post(
    "/webhooks/helius",
    async (c, next) => {
      // Checked before the body is read, so a stranger can't make us read or parse anything.
      if (!secretsMatch(c.req.header("authorization"), secret)) {
        throw new AppError("UNAUTHORIZED");
      }
      await next();
    },
    bodyLimit({
      maxSize: MAX_DELIVERY_BYTES,
      onError: (c) => {
        logger.error(
          { requestId: c.var.requestId, maxBytes: MAX_DELIVERY_BYTES },
          "Helius delivery over the size limit; its events are lost unless reconciled",
        );
        throw new AppError("PAYLOAD_TOO_LARGE");
      },
    }),
    async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch (error) {
        throw new AppError("VALIDATION_FAILED", { cause: error });
      }
      const parsed = deliverySchema.safeParse(body);
      if (!parsed.success) {
        // Usually a misconfigured webhook, for example the "enhanced" type instead of "raw".
        logger.warn(
          { requestId: c.var.requestId, problem: z.prettifyError(parsed.error) },
          "Helius delivery has an unexpected shape",
        );
        throw new AppError("VALIDATION_FAILED", { cause: parsed.error });
      }

      const events = parsed.data.map((transaction) => ({
        signature: transaction.transaction.signatures[0],
        payload: transaction,
      }));
      const saved = await inbox.save("helius", events);
      logger.debug(
        { requestId: c.var.requestId, received: events.length, saved },
        "Helius delivery saved",
      );
      return c.json({ received: events.length, saved }, 200);
    },
  );
  return app;
}
