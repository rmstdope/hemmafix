CREATE TYPE "public"."recurrence_unit" AS ENUM('day', 'week', 'month');--> statement-breakpoint
CREATE TABLE "chore" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"room_id" uuid,
	"title" text NOT NULL,
	"template_key" text,
	"recurrence_unit" "recurrence_unit",
	"recurrence_interval" integer,
	"assignee_id" text,
	"created_by_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chore_recurrence_check" CHECK (("chore"."recurrence_unit" is null and "chore"."recurrence_interval" is null) or ("chore"."recurrence_unit" is not null and "chore"."recurrence_interval" between 1 and 365)),
	CONSTRAINT "chore_active_has_room_check" CHECK ("chore"."archived_at" is not null or "chore"."room_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "chore_instance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chore_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"due_date" date,
	"assignee_id" text,
	"completed_at" timestamp with time zone,
	"completed_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chore" ADD CONSTRAINT "chore_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chore" ADD CONSTRAINT "chore_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chore" ADD CONSTRAINT "chore_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chore" ADD CONSTRAINT "chore_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chore_instance" ADD CONSTRAINT "chore_instance_chore_id_chore_id_fk" FOREIGN KEY ("chore_id") REFERENCES "public"."chore"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chore_instance" ADD CONSTRAINT "chore_instance_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chore_instance" ADD CONSTRAINT "chore_instance_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chore_instance" ADD CONSTRAINT "chore_instance_completed_by_id_user_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chore_household_idx" ON "chore" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chore_instance_one_open_idx" ON "chore_instance" USING btree ("chore_id") WHERE "chore_instance"."completed_at" is null;--> statement-breakpoint
CREATE INDEX "chore_instance_household_open_idx" ON "chore_instance" USING btree ("household_id","completed_at");--> statement-breakpoint
CREATE INDEX "chore_instance_completed_by_idx" ON "chore_instance" USING btree ("completed_by_id","completed_at");