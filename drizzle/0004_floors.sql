CREATE TABLE "floor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floor_id_household_unique" UNIQUE("id","household_id")
);
--> statement-breakpoint
DROP INDEX "room_household_name_idx";--> statement-breakpoint
-- Every home gets floor "1", and its existing rooms move there.
INSERT INTO "floor" ("household_id", "name", "position") SELECT "id", '1', 1 FROM "household";--> statement-breakpoint
ALTER TABLE "room" ADD COLUMN "floor_id" uuid;--> statement-breakpoint
UPDATE "room" SET "floor_id" = "floor"."id" FROM "floor" WHERE "floor"."household_id" = "room"."household_id";--> statement-breakpoint
ALTER TABLE "room" ALTER COLUMN "floor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "floor" ADD CONSTRAINT "floor_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "floor_household_name_idx" ON "floor" USING btree ("household_id",lower("name")) WHERE "floor"."archived_at" is null;--> statement-breakpoint
ALTER TABLE "room" ADD CONSTRAINT "room_floor_same_household_fk" FOREIGN KEY ("floor_id","household_id") REFERENCES "public"."floor"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "room_floor_name_idx" ON "room" USING btree ("floor_id",lower("name")) WHERE "room"."archived_at" is null;