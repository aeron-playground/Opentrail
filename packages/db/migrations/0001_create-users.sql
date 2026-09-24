CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"privy_did" text NOT NULL,
	"wallet_address" text NOT NULL,
	"username" "citext" NOT NULL,
	"username_changed_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"webhook_registered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_privy_did_unique" UNIQUE("privy_did"),
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address"),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'banned', 'deleted'))
);
