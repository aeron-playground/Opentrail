CREATE TABLE "tokens" (
	"mint" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"decimals" smallint NOT NULL,
	"token_program" text NOT NULL,
	"logo_url" text,
	"is_listed" boolean DEFAULT false NOT NULL,
	"sort_rank" integer,
	"primary_pool_address" text,
	"is_jupiter_verified" boolean,
	"mint_authority_revoked" boolean,
	"freeze_authority_revoked" boolean,
	"liquidity_usd" numeric(38, 2),
	"safety_level" text,
	"safety_note" text,
	"safety_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tokens_program_check" CHECK ("tokens"."token_program" in ('spl-token', 'token-2022')),
	CONSTRAINT "tokens_decimals_check" CHECK ("tokens"."decimals" between 0 and 255),
	CONSTRAINT "tokens_safety_level_check" CHECK ("tokens"."safety_level" in ('ok', 'caution', 'high_risk'))
);
--> statement-breakpoint
CREATE INDEX "tokens_listed_rank_idx" ON "tokens" USING btree ("is_listed","sort_rank");