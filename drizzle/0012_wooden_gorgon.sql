CREATE TABLE "high_five" (
	"instance_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "high_five_instance_id_user_id_pk" PRIMARY KEY("instance_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "high_five" ADD CONSTRAINT "high_five_instance_id_chore_instance_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."chore_instance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "high_five" ADD CONSTRAINT "high_five_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;