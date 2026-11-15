ALTER TABLE "chore_instance" ADD COLUMN "done_title" text;--> statement-breakpoint
ALTER TABLE "chore_instance" ADD COLUMN "done_room_id" uuid;--> statement-breakpoint
ALTER TABLE "chore_instance" ADD CONSTRAINT "chore_instance_done_room_same_household_fk" FOREIGN KEY ("done_room_id","household_id") REFERENCES "public"."room"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- What has been done keeps the title and room it had then.
UPDATE "chore_instance" SET "done_title" = "chore"."title", "done_room_id" = "chore"."room_id"
FROM "chore" WHERE "chore"."id" = "chore_instance"."chore_id" AND "chore_instance"."completed_at" IS NOT NULL;--> statement-breakpoint
-- Added in 0004 for a rollback to the release before floors. That release is no longer the one
-- a rollback would return to (production has run the floors release), and current code always
-- sets floor_id.
DROP TRIGGER "room_default_floor" ON "room";--> statement-breakpoint
DROP FUNCTION "room_default_floor"();
