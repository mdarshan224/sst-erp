CREATE INDEX `journal_tenant_year_event` ON `journal_events` (`institution_id`,`academic_year_id`,`event_type`,`created_at`);--> statement-breakpoint
-- Retain the original normalized indexes without creating duplicates.
CREATE INDEX IF NOT EXISTS fees_tenant_year_status ON fee_structures(institution_id,academic_year_id,status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payments_student_created_desc ON payments(institution_id,student_id,created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS student_roll_lookup ON enrollments(institution_id,roll_number);
--> statement-breakpoint
-- New journal records must preserve every source field, including provenance.
CREATE TRIGGER journal_source_provenance BEFORE INSERT ON journal_events BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM journal_legacy_projection p WHERE p.id=NEW.id AND p.institution_id=NEW.institution_id AND p.ledger_entry_id=NEW.ledger_entry_id AND p.academic_year_id=NEW.academic_year_id AND p.student_id=NEW.student_id AND p.amount_paise=NEW.amount_paise AND p.description=NEW.description AND p.created_at=NEW.created_at AND p.created_by=NEW.created_by) THEN RAISE(ABORT,'JOURNAL_SOURCE_MISMATCH') END); END;
--> statement-breakpoint
-- Expose balanced historical postings immediately, without a large data rewrite.
CREATE VIEW journal_effective_events AS SELECT * FROM journal_events UNION ALL SELECT p.* FROM journal_legacy_projection p WHERE NOT EXISTS(SELECT 1 FROM journal_events j WHERE j.ledger_entry_id=p.ledger_entry_id);
--> statement-breakpoint
DROP VIEW journal_postings;
--> statement-breakpoint
CREATE VIEW journal_postings AS SELECT id||':D' id,id event_id,institution_id,academic_year_id,student_id,event_type,debit_account account_code,amount_paise debit_paise,0 credit_paise,entry_date,created_at FROM journal_effective_events UNION ALL SELECT id||':C',id,institution_id,academic_year_id,student_id,event_type,credit_account,0,amount_paise,entry_date,created_at FROM journal_effective_events;
