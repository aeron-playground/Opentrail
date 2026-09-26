CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_address" text NOT NULL,
	"signature" text NOT NULL,
	"slot" bigint NOT NULL,
	"block_time" timestamp with time zone NOT NULL,
	"direction" text NOT NULL,
	"mint" text NOT NULL,
	"amount_raw" numeric(40, 0) NOT NULL,
	"counterparty" text,
	"kind" text NOT NULL,
	"usd_value_micro" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfers_signature_user_mint_direction_kind_unique" UNIQUE("signature","user_id","mint","direction","kind"),
	CONSTRAINT "transfers_direction_check" CHECK ("transfers"."direction" in ('in', 'out')),
	CONSTRAINT "transfers_kind_check" CHECK ("transfers"."kind" in ('deposit', 'withdrawal', 'network_fee', 'rent', 'adjustment', 'other')),
	CONSTRAINT "transfers_amount_check" CHECK ("transfers"."amount_raw" > 0)
);
--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transfers_user_time_idx" ON "transfers" USING btree ("user_id","block_time" DESC NULLS LAST);