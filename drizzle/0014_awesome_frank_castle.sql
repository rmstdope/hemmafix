CREATE TABLE "week_recap_seen" (
	"user_id" text PRIMARY KEY NOT NULL,
	"week_start" date NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "week_recap_seen" ADD CONSTRAINT "week_recap_seen_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;