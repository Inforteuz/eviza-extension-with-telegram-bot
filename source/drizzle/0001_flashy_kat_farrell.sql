ALTER TABLE `applications` ADD `official_url` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `trip_defaults` text DEFAULT '{}' NOT NULL;