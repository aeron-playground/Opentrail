CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"signature" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	CONSTRAINT "webhook_events_provider_signature_unique" UNIQUE("provider","signature"),
	CONSTRAINT "webhook_events_provider_check" CHECK ("webhook_events"."provider" in ('helius')),
	CONSTRAINT "webhook_events_attempts_check" CHECK ("webhook_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX "webhook_events_pending_idx" ON "webhook_events" USING btree ("received_at") WHERE "webhook_events"."processed_at" is null;