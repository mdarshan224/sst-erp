CREATE TABLE `institution_deletion_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`user_id` text NOT NULL,
	`session_hash` text NOT NULL,
	`action` text NOT NULL,
	`otp_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`consumed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `institution_deletion_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`status` text NOT NULL,
	`previous_status` text NOT NULL,
	`institution_name` text NOT NULL,
	`snapshot_key` text,
	`snapshot_hash` text,
	`inventory` text NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`recovery_until` text NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `deletion_jobs_tenant_status` ON `institution_deletion_jobs` (`institution_id`,`status`);--> statement-breakpoint
CREATE TABLE `platform_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`permissions` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_roles_name_unique` ON `platform_roles` (`name`);--> statement-breakpoint
ALTER TABLE `platform_admins` ADD `role_id` text REFERENCES platform_roles(id);
--> statement-breakpoint
INSERT INTO platform_roles(id,name,permissions,active,created_at,updated_at,created_by,updated_by) VALUES('legacy-platform-admin','Existing Super Administrators','["dashboard.view","institutions.view","institutions.create","institutions.edit","institutions.support","institutions.delete","domains.view","domains.manage","reports.view","users.manage","roles.manage","payments.view","payments.configure","subscriptions.view","subscriptions.manage","plans.view","plans.manage","audit.view","settings.view","settings.manage","organizations.manage","holidays.manage"]',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'migration','migration');
--> statement-breakpoint
UPDATE platform_admins SET role_id='legacy-platform-admin' WHERE role_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX deletion_active_institution ON institution_deletion_jobs(institution_id) WHERE status NOT IN ('Restored','Completed');
--> statement-breakpoint
CREATE TRIGGER deletion_job_no_delete BEFORE DELETE ON institution_deletion_jobs BEGIN SELECT RAISE(ABORT,'IMMUTABLE_DELETION_HISTORY'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_academic_years_insert BEFORE INSERT ON academic_years WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_academic_years_update BEFORE UPDATE ON academic_years WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_fee_adjustments_insert BEFORE INSERT ON fee_adjustments WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_fee_adjustments_update BEFORE UPDATE ON fee_adjustments WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_admit_cards_insert BEFORE INSERT ON admit_cards WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_admit_cards_update BEFORE UPDATE ON admit_cards WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_api_idempotency_insert BEFORE INSERT ON api_idempotency WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_api_idempotency_update BEFORE UPDATE ON api_idempotency WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_student_fee_assignments_insert BEFORE INSERT ON student_fee_assignments WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_student_fee_assignments_update BEFORE UPDATE ON student_fee_assignments WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_attendance_days_insert BEFORE INSERT ON attendance_days WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_attendance_days_update BEFORE UPDATE ON attendance_days WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_attendance_events_insert BEFORE INSERT ON attendance_events WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_attendance_events_update BEFORE UPDATE ON attendance_events WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_balance_carryforwards_insert BEFORE INSERT ON balance_carryforwards WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_balance_carryforwards_update BEFORE UPDATE ON balance_carryforwards WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_bank_import_batches_insert BEFORE INSERT ON bank_import_batches WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_bank_import_batches_update BEFORE UPDATE ON bank_import_batches WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_bank_posted_rows_insert BEFORE INSERT ON bank_posted_rows WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_bank_posted_rows_update BEFORE UPDATE ON bank_posted_rows WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_benefits_insert BEFORE INSERT ON benefits WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_benefits_update BEFORE UPDATE ON benefits WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_campuses_insert BEFORE INSERT ON campuses WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_campuses_update BEFORE UPDATE ON campuses WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_cash_closings_insert BEFORE INSERT ON cash_closings WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_cash_closings_update BEFORE UPDATE ON cash_closings WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_cash_entries_insert BEFORE INSERT ON cash_entries WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_cash_entries_update BEFORE UPDATE ON cash_entries WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_classes_insert BEFORE INSERT ON classes WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_classes_update BEFORE UPDATE ON classes WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_communication_settings_insert BEFORE INSERT ON communication_settings WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_communication_settings_update BEFORE UPDATE ON communication_settings WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_daily_fee_charges_insert BEFORE INSERT ON daily_fee_charges WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_daily_fee_charges_update BEFORE UPDATE ON daily_fee_charges WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_daily_fee_rules_insert BEFORE INSERT ON daily_fee_rules WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_daily_fee_rules_update BEFORE UPDATE ON daily_fee_rules WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_document_artifacts_insert BEFORE INSERT ON document_artifacts WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_document_artifacts_update BEFORE UPDATE ON document_artifacts WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_document_jobs_insert BEFORE INSERT ON document_jobs WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_document_jobs_update BEFORE UPDATE ON document_jobs WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_donation_certificates_insert BEFORE INSERT ON donation_certificates WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_donation_certificates_update BEFORE UPDATE ON donation_certificates WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_enrollments_insert BEFORE INSERT ON enrollments WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_enrollments_update BEFORE UPDATE ON enrollments WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_exam_registrations_insert BEFORE INSERT ON exam_registrations WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_exam_registrations_update BEFORE UPDATE ON exam_registrations WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_exam_results_insert BEFORE INSERT ON exam_results WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_exam_results_update BEFORE UPDATE ON exam_results WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_exam_subjects_insert BEFORE INSERT ON exam_subjects WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_exam_subjects_update BEFORE UPDATE ON exam_subjects WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_exams_insert BEFORE INSERT ON exams WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_exams_update BEFORE UPDATE ON exams WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_facility_allocations_insert BEFORE INSERT ON facility_allocations WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_facility_allocations_update BEFORE UPDATE ON facility_allocations WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_facility_billings_insert BEFORE INSERT ON facility_billings WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_facility_billings_update BEFORE UPDATE ON facility_billings WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_fee_components_insert BEFORE INSERT ON fee_components WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_fee_components_update BEFORE UPDATE ON fee_components WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_fee_structure_items_insert BEFORE INSERT ON fee_structure_items WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_fee_structure_items_update BEFORE UPDATE ON fee_structure_items WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_fee_structures_insert BEFORE INSERT ON fee_structures WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_fee_structures_update BEFORE UPDATE ON fee_structures WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_gateway_events_insert BEFORE INSERT ON gateway_events WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_gateway_events_update BEFORE UPDATE ON gateway_events WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_hardware_devices_insert BEFORE INSERT ON hardware_devices WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_hardware_devices_update BEFORE UPDATE ON hardware_devices WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_holidays_insert BEFORE INSERT ON holidays WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_holidays_update BEFORE UPDATE ON holidays WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_hostel_blocks_insert BEFORE INSERT ON hostel_blocks WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_hostel_blocks_update BEFORE UPDATE ON hostel_blocks WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_hostel_rooms_insert BEFORE INSERT ON hostel_rooms WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_hostel_rooms_update BEFORE UPDATE ON hostel_rooms WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_installments_insert BEFORE INSERT ON installments WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_installments_update BEFORE UPDATE ON installments WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_invitations_insert BEFORE INSERT ON invitations WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_invitations_update BEFORE UPDATE ON invitations WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_invoice_items_insert BEFORE INSERT ON invoice_items WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_invoice_items_update BEFORE UPDATE ON invoice_items WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_invoices_insert BEFORE INSERT ON invoices WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_invoices_update BEFORE UPDATE ON invoices WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_journal_events_insert BEFORE INSERT ON journal_events WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_journal_events_update BEFORE UPDATE ON journal_events WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_late_fee_runs_insert BEFORE INSERT ON late_fee_runs WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_late_fee_runs_update BEFORE UPDATE ON late_fee_runs WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_ledger_entries_insert BEFORE INSERT ON ledger_entries WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_ledger_entries_update BEFORE UPDATE ON ledger_entries WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_memberships_insert BEFORE INSERT ON memberships WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_memberships_update BEFORE UPDATE ON memberships WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_notification_outbox_insert BEFORE INSERT ON notification_outbox WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_notification_outbox_update BEFORE UPDATE ON notification_outbox WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_notifications_insert BEFORE INSERT ON notifications WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_notifications_update BEFORE UPDATE ON notifications WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_parent_portal_grants_insert BEFORE INSERT ON parent_portal_grants WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_parent_portal_grants_update BEFORE UPDATE ON parent_portal_grants WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_parents_insert BEFORE INSERT ON parents WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_parents_update BEFORE UPDATE ON parents WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_payment_allocations_insert BEFORE INSERT ON payment_allocations WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_payment_allocations_update BEFORE UPDATE ON payment_allocations WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_payment_intents_insert BEFORE INSERT ON payment_intents WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_payment_intents_update BEFORE UPDATE ON payment_intents WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_payment_links_insert BEFORE INSERT ON payment_links WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_payment_links_update BEFORE UPDATE ON payment_links WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_payments_insert BEFORE INSERT ON payments WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_payments_update BEFORE UPDATE ON payments WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_provider_configs_insert BEFORE INSERT ON provider_configs WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_provider_configs_update BEFORE UPDATE ON provider_configs WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_receipts_insert BEFORE INSERT ON receipts WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_receipts_update BEFORE UPDATE ON receipts WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_reconciliation_records_insert BEFORE INSERT ON reconciliation_records WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_reconciliation_records_update BEFORE UPDATE ON reconciliation_records WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_refund_allocations_insert BEFORE INSERT ON refund_allocations WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_refund_allocations_update BEFORE UPDATE ON refund_allocations WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_refunds_insert BEFORE INSERT ON refunds WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_refunds_update BEFORE UPDATE ON refunds WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_rfid_cards_insert BEFORE INSERT ON rfid_cards WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_rfid_cards_update BEFORE UPDATE ON rfid_cards WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_rollover_students_insert BEFORE INSERT ON rollover_students WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_rollover_students_update BEFORE UPDATE ON rollover_students WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_sections_insert BEFORE INSERT ON sections WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_sections_update BEFORE UPDATE ON sections WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_streams_insert BEFORE INSERT ON streams WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_streams_update BEFORE UPDATE ON streams WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_student_parents_insert BEFORE INSERT ON student_parents WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_student_parents_update BEFORE UPDATE ON student_parents WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_students_insert BEFORE INSERT ON students WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_students_update BEFORE UPDATE ON students WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_teaching_assignments_insert BEFORE INSERT ON teaching_assignments WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_teaching_assignments_update BEFORE UPDATE ON teaching_assignments WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_teaching_subjects_insert BEFORE INSERT ON teaching_subjects WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_teaching_subjects_update BEFORE UPDATE ON teaching_subjects WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_timetable_slots_insert BEFORE INSERT ON timetable_slots WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_timetable_slots_update BEFORE UPDATE ON timetable_slots WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_timetables_insert BEFORE INSERT ON timetables WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_timetables_update BEFORE UPDATE ON timetables WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_transport_routes_insert BEFORE INSERT ON transport_routes WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_transport_routes_update BEFORE UPDATE ON transport_routes WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_transport_stops_insert BEFORE INSERT ON transport_stops WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_transport_stops_update BEFORE UPDATE ON transport_stops WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_transport_vehicles_insert BEFORE INSERT ON transport_vehicles WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_transport_vehicles_update BEFORE UPDATE ON transport_vehicles WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_tuition_allocations_insert BEFORE INSERT ON tuition_allocations WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_tuition_allocations_update BEFORE UPDATE ON tuition_allocations WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_webhook_inbox_insert BEFORE INSERT ON webhook_inbox WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_webhook_inbox_update BEFORE UPDATE ON webhook_inbox WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_year_rollovers_insert BEFORE INSERT ON year_rollovers WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_year_rollovers_update BEFORE UPDATE ON year_rollovers WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_institution_domains_insert BEFORE INSERT ON institution_domains WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_institution_domains_update BEFORE UPDATE ON institution_domains WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_subscription_payments_insert BEFORE INSERT ON subscription_payments WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_subscription_payments_update BEFORE UPDATE ON subscription_payments WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_institution_subscriptions_insert BEFORE INSERT ON institution_subscriptions WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;

--> statement-breakpoint
CREATE TRIGGER deleting_tenant_institution_subscriptions_update BEFORE UPDATE ON institution_subscriptions WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status IN ('Deleting','Deleted')) BEGIN SELECT RAISE(ABORT,'TENANT_DELETING'); END;
