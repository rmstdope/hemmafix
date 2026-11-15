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
CREATE UNIQUE INDEX "room_floor_name_idx" ON "room" USING btree ("floor_id",lower("name")) WHERE "room"."archived_at" is null;--> statement-breakpoint
-- Backward compatibility (migration_policy: backward-compatible): the previous release inserts
-- rooms without a floor, and households without floors. Should it run against this schema
-- after a rollback, such a room goes on its home's bottom floor, created if the home has none.
-- Current code always sets floor_id; drop this in a later release.
CREATE FUNCTION "room_default_floor"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW."floor_id" IS NULL THEN
		SELECT "id" INTO NEW."floor_id" FROM "floor"
		WHERE "household_id" = NEW."household_id" AND "archived_at" IS NULL
		ORDER BY "position", "created_at" LIMIT 1;
		IF NEW."floor_id" IS NULL THEN
			INSERT INTO "floor" ("household_id", "name", "position") VALUES (NEW."household_id", '1', 1)
			RETURNING "id" INTO NEW."floor_id";
		END IF;
	END IF;
	RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "room_default_floor" BEFORE INSERT ON "room" FOR EACH ROW EXECUTE FUNCTION "room_default_floor"();
