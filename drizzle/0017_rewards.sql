CREATE TABLE "reward" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_price_check" CHECK ("reward"."price" between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "reward_purchase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"buyer_id" text NOT NULL,
	"name" text NOT NULL,
	"price" integer NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "reward_purchase_status_check" CHECK ("reward_purchase"."status" in ('waiting', 'given', 'declined'))
);
--> statement-breakpoint
ALTER TABLE "reward" ADD CONSTRAINT "reward_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_purchase" ADD CONSTRAINT "reward_purchase_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_purchase" ADD CONSTRAINT "reward_purchase_buyer_id_user_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reward_household_idx" ON "reward" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "reward_purchase_household_status_idx" ON "reward_purchase" USING btree ("household_id","status");--> statement-breakpoint
CREATE INDEX "reward_purchase_buyer_idx" ON "reward_purchase" USING btree ("buyer_id","created_at");