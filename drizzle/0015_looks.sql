CREATE TABLE "look_purchase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"price" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "look_purchase_user_look_unique" UNIQUE("user_id","kind","key"),
	CONSTRAINT "look_purchase_kind_check" CHECK ("look_purchase"."kind" in ('frame', 'theme', 'coin')),
	CONSTRAINT "look_purchase_price_check" CHECK ("look_purchase"."price" >= 0)
);
--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "frame" text;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "theme" text;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "coin_look" text;--> statement-breakpoint
ALTER TABLE "look_purchase" ADD CONSTRAINT "look_purchase_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "look_purchase" ADD CONSTRAINT "look_purchase_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;