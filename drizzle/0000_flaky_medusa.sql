CREATE TABLE `attention_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attention_events_session_created_idx` ON `attention_events` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `attention_events_owner_created_idx` ON `attention_events` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `attention_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`intention` text NOT NULL,
	`energy_start` text NOT NULL,
	`energy_end` text,
	`target_minutes` integer,
	`started_at` text NOT NULL,
	`ended_at` text,
	`outcome` text,
	`note` text,
	`status` text DEFAULT 'active' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attention_sessions_owner_started_idx` ON `attention_sessions` (`owner_id`,`started_at`);