CREATE TABLE "badge_award" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"coins" integer NOT NULL,
	"won_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "badge_award_user_household_key_unique" UNIQUE("user_id","household_id","key"),
	CONSTRAINT "badge_award_coins_check" CHECK ("badge_award"."coins" >= 0)
);
--> statement-breakpoint
CREATE TABLE "badge_epoch" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "badge_epoch_single_check" CHECK ("badge_epoch"."id")
);
--> statement-breakpoint
ALTER TABLE "badge_award" ADD CONSTRAINT "badge_award_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badge_award" ADD CONSTRAINT "badge_award_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "badge_epoch" DEFAULT VALUES ON CONFLICT DO NOTHING;
