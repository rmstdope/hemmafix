CREATE TABLE "daily_chest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"coins" integer NOT NULL,
	"opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_chest_user_day_unique" UNIQUE("user_id","day"),
	CONSTRAINT "daily_chest_coins_check" CHECK ("daily_chest"."coins" between 5 and 10)
);
--> statement-breakpoint
ALTER TABLE "daily_chest" ADD CONSTRAINT "daily_chest_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_chest" ADD CONSTRAINT "daily_chest_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;