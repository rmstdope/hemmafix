CREATE TABLE "room" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "membership" ALTER COLUMN "role" SET DEFAULT 'child'::text;--> statement-breakpoint
-- Roles become adult/child: the household's admin is an adult, everyone else a child until an adult changes it.
UPDATE "membership" SET "role" = CASE "role" WHEN 'admin' THEN 'adult' ELSE 'child' END;--> statement-breakpoint
DROP TYPE "public"."member_role";--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('adult', 'child');--> statement-breakpoint
ALTER TABLE "membership" ALTER COLUMN "role" SET DEFAULT 'child'::"public"."member_role";--> statement-breakpoint
ALTER TABLE "membership" ALTER COLUMN "role" SET DATA TYPE "public"."member_role" USING "role"::"public"."member_role";--> statement-breakpoint
ALTER TABLE "room" ADD CONSTRAINT "room_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "room_household_name_idx" ON "room" USING btree ("household_id",lower("name"));