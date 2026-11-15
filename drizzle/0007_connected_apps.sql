CREATE TABLE "app_connection_use" (
	"connection_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"last_used_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_token" (
	"jti" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_connection_use" ADD CONSTRAINT "app_connection_use_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_token_connection_idx" ON "app_token" USING btree ("connection_id");