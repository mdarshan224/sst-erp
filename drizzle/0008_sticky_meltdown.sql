CREATE TABLE `sms_accounts` (
	`mobile` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`verified_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sms_account_user` ON `sms_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `sms_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`mobile` text NOT NULL,
	`purpose` text NOT NULL,
	`email` text NOT NULL,
	`user_id` text NOT NULL,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`resends` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_sent_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sms_mobile_purpose` ON `sms_challenges` (`mobile`,`purpose`);--> statement-breakpoint
CREATE TABLE `sms_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mobile` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sms_session_user` ON `sms_sessions` (`user_id`);