CREATE TABLE `telegram_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`telegram_user_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_telegram_sessions_expiry` ON `telegram_sessions` (`expires_at`);--> statement-breakpoint
ALTER TABLE `settings` ADD `telegram_bot_id` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `telegram_bot_username` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `telegram_operator_id` text;