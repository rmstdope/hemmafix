ALTER TABLE "chore" ADD COLUMN "coins" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "routine_task" ADD COLUMN "coins" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "chore" ADD CONSTRAINT "chore_coins_check" CHECK ("chore"."coins" between 0 and 100);--> statement-breakpoint
ALTER TABLE "routine_task" ADD CONSTRAINT "routine_task_coins_check" CHECK ("routine_task"."coins" between 0 and 100);