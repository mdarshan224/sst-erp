CREATE TABLE `portal_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`kind` text NOT NULL,
	`student_id` text,
	`parent_id` text,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`must_change` integer DEFAULT 1 NOT NULL,
	`credential_expires` text,
	`version` integer DEFAULT 1 NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `parents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_accounts_username_unique` ON `portal_accounts` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `portal_student_account` ON `portal_accounts` (`institution_id`,`student_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `portal_parent_account` ON `portal_accounts` (`institution_id`,`parent_id`);--> statement-breakpoint
CREATE TABLE `portal_announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'Published' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `portal_announcement_scope` ON `portal_announcements` (`institution_id`,`student_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `portal_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`title` text NOT NULL,
	`object_key` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`status` text DEFAULT 'Published' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `portal_document_scope` ON `portal_documents` (`institution_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `portal_service_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`kind` text NOT NULL,
	`notes` text NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`resolution` text,
	`allocation_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`allocation_id`) REFERENCES `facility_allocations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `portal_service_scope` ON `portal_service_requests` (`institution_id`,`student_id`,`academic_year_id`);--> statement-breakpoint
CREATE TABLE `portal_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`account_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`version` integer NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `portal_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_sessions_token_hash_unique` ON `portal_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `portal_session_account` ON `portal_sessions` (`institution_id`,`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX portal_pending_service ON portal_service_requests(institution_id,student_id,academic_year_id,kind) WHERE status='Pending';
--> statement-breakpoint
CREATE TRIGGER portal_account_scope BEFORE INSERT ON portal_accounts BEGIN SELECT (CASE WHEN NOT ((NEW.kind='Student' AND NEW.parent_id IS NULL AND EXISTS(SELECT 1 FROM students WHERE id=NEW.student_id AND institution_id=NEW.institution_id)) OR (NEW.kind='Parent' AND NEW.student_id IS NULL AND EXISTS(SELECT 1 FROM parents WHERE id=NEW.parent_id AND institution_id=NEW.institution_id))) THEN RAISE(ABORT,'PORTAL_ACCOUNT_SCOPE') END); END;
--> statement-breakpoint
CREATE TRIGGER portal_account_identity BEFORE UPDATE ON portal_accounts BEGIN SELECT (CASE WHEN NEW.institution_id<>OLD.institution_id OR NEW.kind<>OLD.kind OR NEW.student_id IS NOT OLD.student_id OR NEW.parent_id IS NOT OLD.parent_id THEN RAISE(ABORT,'PORTAL_IDENTITY_IMMUTABLE') END); END;
--> statement-breakpoint
CREATE TRIGGER portal_session_scope BEFORE INSERT ON portal_sessions BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM portal_accounts WHERE id=NEW.account_id AND institution_id=NEW.institution_id AND version=NEW.version AND active=1) THEN RAISE(ABORT,'PORTAL_SESSION_SCOPE') END); END;
--> statement-breakpoint
CREATE TRIGGER portal_document_scope_guard BEFORE INSERT ON portal_documents BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM students WHERE id=NEW.student_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'PORTAL_DOCUMENT_SCOPE') END); END;
--> statement-breakpoint
CREATE TRIGGER portal_announcement_scope_guard BEFORE INSERT ON portal_announcements BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students WHERE id=NEW.student_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'PORTAL_ANNOUNCEMENT_SCOPE') END); END;
--> statement-breakpoint
CREATE TRIGGER portal_request_scope_guard BEFORE INSERT ON portal_service_requests BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM enrollments WHERE student_id=NEW.student_id AND institution_id=NEW.institution_id AND academic_year_id=NEW.academic_year_id) THEN RAISE(ABORT,'PORTAL_REQUEST_SCOPE') END); END;
