ALTER TABLE "server" ADD COLUMN "health_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "health_detail" text;