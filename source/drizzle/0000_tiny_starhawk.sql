CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`source` text NOT NULL,
	`source_key` text,
	`data` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`job_type` text DEFAULT 'extract' NOT NULL,
	`step` text DEFAULT 'upload' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`passport_key` text,
	`portrait_key` text,
	`application_number` text,
	`payment_url` text,
	`lease` text,
	`lease_until` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_applications_owner_status` ON `applications` (`owner`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_applications_source_key` ON `applications` (`owner`,`source_key`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`application_id` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_application` ON `events` (`owner`,`application_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`owner` text PRIMARY KEY NOT NULL,
	`runner_hash` text,
	`heartbeat` integer,
	`connections` text DEFAULT '{}' NOT NULL
);
