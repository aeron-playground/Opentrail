CREATE TABLE "candles" (
	"mint" text NOT NULL,
	"timeframe" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"open" numeric(38, 18) NOT NULL,
	"high" numeric(38, 18) NOT NULL,
	"low" numeric(38, 18) NOT NULL,
	"close" numeric(38, 18) NOT NULL,
	"volume_usd" numeric(38, 2) NOT NULL,
	CONSTRAINT "candles_mint_timeframe_bucket_start_pk" PRIMARY KEY("mint","timeframe","bucket_start"),
	CONSTRAINT "candles_timeframe_check" CHECK ("candles"."timeframe" in ('15m', '1h', '4h', '1d')),
	CONSTRAINT "candles_prices_check" CHECK ("candles"."open" > 0 and "candles"."high" > 0 and "candles"."low" > 0 and "candles"."close" > 0),
	CONSTRAINT "candles_range_check" CHECK ("candles"."high" >= "candles"."low"),
	CONSTRAINT "candles_volume_check" CHECK ("candles"."volume_usd" >= 0)
);
--> statement-breakpoint
ALTER TABLE "candles" ADD CONSTRAINT "candles_mint_tokens_mint_fk" FOREIGN KEY ("mint") REFERENCES "public"."tokens"("mint") ON DELETE no action ON UPDATE no action;