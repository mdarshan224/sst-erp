CREATE TABLE `admit_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`registration_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`registration_id`) REFERENCES `exam_registrations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admit_cards_token_hash_unique` ON `admit_cards` (`token_hash`);--> statement-breakpoint
CREATE INDEX `admit_registration` ON `admit_cards` (`institution_id`,`registration_id`);--> statement-breakpoint
CREATE TABLE `exam_registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`exam_id` text NOT NULL,
	`student_id` text NOT NULL,
	`enrollment_id` text NOT NULL,
	`subjects` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exam_student_registration` ON `exam_registrations` (`exam_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `exam_registration_tenant` ON `exam_registrations` (`institution_id`,`exam_id`);--> statement-breakpoint
CREATE TABLE `exam_results` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`registration_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`score_units` integer,
	`qualitative` text,
	`assignment_status` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`absent` integer DEFAULT 0 NOT NULL,
	`official_grade` text,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`registration_id`) REFERENCES `exam_registrations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subject_id`) REFERENCES `exam_subjects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exam_result_subject` ON `exam_results` (`registration_id`,`subject_id`);--> statement-breakpoint
CREATE TABLE `exam_subjects` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`exam_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`assessment` text NOT NULL,
	`min_units` integer NOT NULL,
	`max_units` integer NOT NULL,
	`pass_units` integer NOT NULL,
	`exam_date` text,
	`start_time` text,
	`end_time` text,
	`room` text DEFAULT '' NOT NULL,
	`grader_user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grader_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exam_subject_code` ON `exam_subjects` (`exam_id`,`code`);--> statement-breakpoint
CREATE TABLE `exams` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`section_id` text NOT NULL,
	`name` text NOT NULL,
	`board` text NOT NULL,
	`tier` text NOT NULL,
	`kind` text NOT NULL,
	`competitive_exam` text,
	`policy` text NOT NULL,
	`policy_reference` text NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `exam_scope` ON `exams` (`institution_id`,`academic_year_id`,`section_id`,`status`);--> statement-breakpoint
CREATE TRIGGER exam_scope_guard BEFORE INSERT ON exams BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM sections s JOIN academic_years y ON y.id=s.academic_year_id AND y.institution_id=s.institution_id WHERE s.id=NEW.section_id AND s.institution_id=NEW.institution_id AND y.id=NEW.academic_year_id) OR NOT json_valid(NEW.policy) OR NEW.status<>'Draft' THEN RAISE(ABORT,'EXAM_SCOPE') END); END;
--> statement-breakpoint
CREATE TRIGGER exam_update_guard BEFORE UPDATE ON exams BEGIN SELECT (CASE WHEN NEW.institution_id<>OLD.institution_id OR NEW.academic_year_id<>OLD.academic_year_id OR NEW.section_id<>OLD.section_id OR NEW.policy<>OLD.policy OR NEW.board<>OLD.board OR NEW.tier<>OLD.tier OR NEW.kind<>OLD.kind OR NOT ((OLD.status='Draft' AND NEW.status='Scheduled') OR (OLD.status='Scheduled' AND NEW.status='Published') OR (OLD.status<>'Archived' AND NEW.status='Archived')) THEN RAISE(ABORT,'EXAM_FROZEN') END); SELECT (CASE WHEN NEW.status='Published' AND EXISTS(SELECT 1 FROM exam_registrations r,json_each(r.subjects) j WHERE r.exam_id=NEW.id AND r.institution_id=NEW.institution_id AND NOT EXISTS(SELECT 1 FROM exam_results x WHERE x.registration_id=r.id AND x.subject_id=j.value AND x.institution_id=r.institution_id)) THEN RAISE(ABORT,'RESULTS_INCOMPLETE') END); END;
--> statement-breakpoint
CREATE TRIGGER exam_no_delete BEFORE DELETE ON exams BEGIN SELECT RAISE(ABORT,'EXAM_HISTORY'); END;
--> statement-breakpoint
CREATE TRIGGER exam_subject_guard BEFORE INSERT ON exam_subjects BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM exams e WHERE e.id=NEW.exam_id AND e.institution_id=NEW.institution_id AND e.status='Draft') OR typeof(NEW.max_units)<>'integer' OR typeof(NEW.min_units)<>'integer' OR typeof(NEW.pass_units)<>'integer' OR NEW.max_units<=0 OR NEW.min_units>0 OR NEW.pass_units<0 OR NEW.pass_units>NEW.max_units THEN RAISE(ABORT,'EXAM_SUBJECT_SCOPE') END); END;
--> statement-breakpoint
CREATE TRIGGER exam_subject_no_update BEFORE UPDATE ON exam_subjects BEGIN SELECT RAISE(ABORT,'EXAM_SUBJECT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER exam_subject_no_delete BEFORE DELETE ON exam_subjects BEGIN SELECT RAISE(ABORT,'EXAM_SUBJECT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER exam_registration_guard BEFORE INSERT ON exam_registrations BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM exams x JOIN enrollments e ON e.institution_id=x.institution_id AND e.academic_year_id=x.academic_year_id AND e.section_id=x.section_id WHERE x.id=NEW.exam_id AND x.institution_id=NEW.institution_id AND x.status='Draft' AND e.id=NEW.enrollment_id AND e.student_id=NEW.student_id) OR NOT json_valid(NEW.subjects) OR json_array_length(NEW.subjects)=0 OR EXISTS(SELECT 1 FROM json_each(NEW.subjects) j WHERE NOT EXISTS(SELECT 1 FROM exam_subjects s WHERE s.id=j.value AND s.exam_id=NEW.exam_id AND s.institution_id=NEW.institution_id)) THEN RAISE(ABORT,'EXAM_REGISTRATION_SCOPE') END); END;
--> statement-breakpoint
CREATE TRIGGER exam_registration_no_update BEFORE UPDATE ON exam_registrations BEGIN SELECT RAISE(ABORT,'EXAM_REGISTRATION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER exam_registration_no_delete BEFORE DELETE ON exam_registrations BEGIN SELECT RAISE(ABORT,'EXAM_REGISTRATION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER exam_result_insert_guard BEFORE INSERT ON exam_results BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM exam_registrations r JOIN exams e ON e.id=r.exam_id AND e.institution_id=r.institution_id JOIN exam_subjects s ON s.exam_id=e.id AND s.institution_id=e.institution_id WHERE r.id=NEW.registration_id AND r.institution_id=NEW.institution_id AND s.id=NEW.subject_id AND e.status='Scheduled' AND EXISTS(SELECT 1 FROM json_each(r.subjects) j WHERE j.value=s.id) AND ((NEW.absent=1 AND NEW.score_units IS NULL) OR (NEW.absent=0 AND ((e.tier='Nursery' AND NEW.score_units IS NULL AND EXISTS(SELECT 1 FROM json_each(e.policy,'$.qualitative') q WHERE q.value=NEW.qualitative)) OR (e.tier<>'Nursery' AND typeof(NEW.score_units)='integer' AND NEW.score_units BETWEEN s.min_units AND s.max_units))))) THEN RAISE(ABORT,'EXAM_RESULT_SCOPE') END); SELECT (CASE WHEN NEW.version<>COALESCE((SELECT version+1 FROM exam_results WHERE registration_id=NEW.registration_id AND subject_id=NEW.subject_id),1) THEN RAISE(ABORT,'RESULT_CONFLICT') END); END;
--> statement-breakpoint
CREATE TRIGGER exam_result_update_guard BEFORE UPDATE ON exam_results BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM exam_registrations r JOIN exams e ON e.id=r.exam_id AND e.institution_id=r.institution_id JOIN exam_subjects s ON s.exam_id=e.id AND s.institution_id=e.institution_id WHERE r.id=NEW.registration_id AND r.institution_id=NEW.institution_id AND s.id=NEW.subject_id AND e.status='Scheduled' AND EXISTS(SELECT 1 FROM json_each(r.subjects) j WHERE j.value=s.id) AND ((NEW.absent=1 AND NEW.score_units IS NULL) OR (NEW.absent=0 AND ((e.tier='Nursery' AND NEW.score_units IS NULL AND EXISTS(SELECT 1 FROM json_each(e.policy,'$.qualitative') q WHERE q.value=NEW.qualitative)) OR (e.tier<>'Nursery' AND typeof(NEW.score_units)='integer' AND NEW.score_units BETWEEN s.min_units AND s.max_units))))) THEN RAISE(ABORT,'EXAM_RESULT_SCOPE') END); SELECT (CASE WHEN NEW.institution_id<>OLD.institution_id OR NEW.registration_id<>OLD.registration_id OR NEW.subject_id<>OLD.subject_id OR NEW.version<>OLD.version+1 OR NOT EXISTS(SELECT 1 FROM exam_registrations r JOIN exams e ON e.id=r.exam_id AND e.institution_id=r.institution_id WHERE r.id=OLD.registration_id AND e.status='Scheduled') THEN RAISE(ABORT,'EXAM_RESULT_FROZEN') END); END;
--> statement-breakpoint
CREATE TRIGGER exam_result_no_delete BEFORE DELETE ON exam_results BEGIN SELECT RAISE(ABORT,'EXAM_RESULT_HISTORY'); END;
--> statement-breakpoint
CREATE TRIGGER admit_card_scope BEFORE INSERT ON admit_cards BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM exam_registrations r JOIN exams e ON e.id=r.exam_id AND e.institution_id=r.institution_id WHERE r.id=NEW.registration_id AND r.institution_id=NEW.institution_id AND e.status IN ('Scheduled','Published')) OR length(NEW.token_hash)<>64 THEN RAISE(ABORT,'ADMIT_CARD_SCOPE') END); END;
--> statement-breakpoint
CREATE TRIGGER admit_card_no_delete BEFORE DELETE ON admit_cards BEGIN SELECT RAISE(ABORT,'ADMIT_CARD_HISTORY'); END;
--> statement-breakpoint
CREATE TRIGGER admit_card_update_guard BEFORE UPDATE ON admit_cards BEGIN SELECT (CASE WHEN NEW.institution_id<>OLD.institution_id OR NEW.registration_id<>OLD.registration_id OR NEW.token_hash<>OLD.token_hash OR NEW.expires_at<>OLD.expires_at THEN RAISE(ABORT,'ADMIT_CARD_IMMUTABLE') END); END;
