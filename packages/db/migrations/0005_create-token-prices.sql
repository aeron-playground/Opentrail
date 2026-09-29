CREATE TABLE "token_prices" (
	"mint" text PRIMARY KEY NOT NULL,
	"price_usd" numeric(38, 18) NOT NULL,
	"change_24h_pct" numeric(12, 4),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "token_prices_price_check" CHECK ("token_prices"."price_usd" > 0)
);
--> statement-breakpoint
ALTER TABLE "token_prices" ADD CONSTRAINT "token_prices_mint_tokens_mint_fk" FOREIGN KEY ("mint") REFERENCES "public"."tokens"("mint") ON DELETE no action ON UPDATE no action;