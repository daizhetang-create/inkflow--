CREATE TABLE `plan_items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`planned_start` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`started_at` text,
	`elapsed_seconds` integer DEFAULT 0 NOT NULL,
	`completed_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plan_items_owner_start_idx` ON `plan_items` (`owner_id`,`planned_start`);