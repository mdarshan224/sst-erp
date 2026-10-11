CREATE TABLE `attendance_days` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`section_id` text NOT NULL,
	`enrollment_id` text NOT NULL,
	`student_id` text NOT NULL,
	`local_date` text NOT NULL,
	`morning` text NOT NULL,
	`afternoon` text NOT NULL,
	`half_day` integer DEFAULT 0 NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_day_once` ON `attendance_days` (`institution_id`,`enrollment_id`,`local_date`);--> statement-breakpoint
CREATE INDEX `attendance_section_date` ON `attendance_days` (`institution_id`,`academic_year_id`,`section_id`,`local_date`);--> statement-breakpoint
CREATE TABLE `teaching_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`section_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`teacher_id` text NOT NULL,
	`periods_per_week` integer NOT NULL,
	`room` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subject_id`) REFERENCES `teaching_subjects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teaching_section_subject` ON `teaching_assignments` (`institution_id`,`academic_year_id`,`section_id`,`subject_id`);--> statement-breakpoint
CREATE INDEX `teacher_scope` ON `teaching_assignments` (`institution_id`,`teacher_id`,`academic_year_id`,`section_id`);--> statement-breakpoint
CREATE TABLE `teaching_subjects` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teaching_subject_code` ON `teaching_subjects` (`institution_id`,`code`);--> statement-breakpoint
CREATE TABLE `timetable_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`timetable_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`start_minute` integer NOT NULL,
	`end_minute` integer NOT NULL,
	`room` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`timetable_id`) REFERENCES `timetables`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignment_id`) REFERENCES `teaching_assignments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `timetable_day` ON `timetable_slots` (`institution_id`,`timetable_id`,`weekday`,`start_minute`);--> statement-breakpoint
CREATE TABLE `timetables` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`published_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `timetable_scope` ON `timetables` (`institution_id`,`academic_year_id`,`status`);--> statement-breakpoint
ALTER TABLE `institution_domains` ADD `hosting_id` text;--> statement-breakpoint
ALTER TABLE `institution_domains` ADD `hosting_status` text;--> statement-breakpoint
ALTER TABLE `institution_domains` ADD `hosting_records` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `institution_domains` ADD `hosting_checked_at` text;--> statement-breakpoint
ALTER TABLE `institution_domains` ADD `hosting_error` text;--> statement-breakpoint
CREATE UNIQUE INDEX timetable_one_published ON timetables(institution_id,academic_year_id) WHERE status='Published';
--> statement-breakpoint
CREATE TRIGGER teaching_assignment_scope BEFORE INSERT ON teaching_assignments BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM sections s JOIN academic_years y ON y.id=s.academic_year_id AND y.institution_id=s.institution_id JOIN teaching_subjects sub ON sub.id=NEW.subject_id AND sub.institution_id=s.institution_id JOIN memberships m ON m.institution_id=s.institution_id AND m.user_id=NEW.teacher_id AND m.active=1 AND m.role='TEACHER' WHERE s.id=NEW.section_id AND s.institution_id=NEW.institution_id AND y.id=NEW.academic_year_id AND y.status NOT IN ('Closed','Archived')) OR NEW.periods_per_week NOT BETWEEN 1 AND 20 THEN RAISE(ABORT,'TEACHING_SCOPE') END); END;
--> statement-breakpoint
CREATE TRIGGER teaching_assignment_no_update BEFORE UPDATE ON teaching_assignments BEGIN SELECT RAISE(ABORT,'TEACHING_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER timetable_insert_scope BEFORE INSERT ON timetables BEGIN SELECT (CASE WHEN NEW.status<>'Draft' OR NEW.version<>1 OR NOT EXISTS(SELECT 1 FROM academic_years y WHERE y.id=NEW.academic_year_id AND y.institution_id=NEW.institution_id AND y.status NOT IN ('Closed','Archived')) THEN RAISE(ABORT,'TIMETABLE_SCOPE') END); END;
--> statement-breakpoint
CREATE TRIGGER timetable_update_scope BEFORE UPDATE ON timetables BEGIN SELECT (CASE WHEN NEW.id<>OLD.id OR NEW.institution_id<>OLD.institution_id OR NEW.academic_year_id<>OLD.academic_year_id OR NEW.version<>OLD.version+1 OR NOT ((OLD.status='Draft' AND NEW.status IN ('Draft','Published')) OR (OLD.status='Published' AND NEW.status='Archived')) THEN RAISE(ABORT,'TIMETABLE_STALE') END); END;
--> statement-breakpoint
CREATE TRIGGER timetable_no_delete BEFORE DELETE ON timetables BEGIN SELECT RAISE(ABORT,'TIMETABLE_HISTORY'); END;
--> statement-breakpoint
CREATE TRIGGER timetable_slot_insert_guard BEFORE INSERT ON timetable_slots BEGIN SELECT (CASE WHEN NEW.weekday NOT BETWEEN 1 AND 7 OR NEW.start_minute NOT BETWEEN 0 AND 1439 OR NEW.end_minute NOT BETWEEN 1 AND 1440 OR NEW.start_minute>=NEW.end_minute OR NOT EXISTS(SELECT 1 FROM timetables t JOIN teaching_assignments a ON a.academic_year_id=t.academic_year_id AND a.institution_id=t.institution_id WHERE t.id=NEW.timetable_id AND t.institution_id=NEW.institution_id AND t.status='Draft' AND a.id=NEW.assignment_id) THEN RAISE(ABORT,'TIMETABLE_SCOPE') END); SELECT (CASE WHEN EXISTS(SELECT 1 FROM timetable_slots x JOIN teaching_assignments a ON a.id=x.assignment_id JOIN teaching_assignments n ON n.id=NEW.assignment_id WHERE x.institution_id=NEW.institution_id AND x.timetable_id=NEW.timetable_id AND x.weekday=NEW.weekday AND x.start_minute<NEW.end_minute AND NEW.start_minute<x.end_minute AND (a.teacher_id=n.teacher_id OR a.section_id=n.section_id OR lower(trim(x.room))=lower(trim(NEW.room)))) THEN RAISE(ABORT,'TIMETABLE_CONFLICT') END); END;
--> statement-breakpoint
CREATE TRIGGER timetable_slot_no_update BEFORE UPDATE ON timetable_slots BEGIN SELECT RAISE(ABORT,'TIMETABLE_SLOT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER timetable_slot_delete_guard BEFORE DELETE ON timetable_slots BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM timetables t WHERE t.id=OLD.timetable_id AND t.institution_id=OLD.institution_id AND t.status='Draft') THEN RAISE(ABORT,'TIMETABLE_FROZEN') END); END;
--> statement-breakpoint
CREATE TRIGGER attendance_insert_scope BEFORE INSERT ON attendance_days BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM enrollments e JOIN academic_years y ON y.id=e.academic_year_id AND y.institution_id=e.institution_id WHERE e.id=NEW.enrollment_id AND e.institution_id=NEW.institution_id AND e.student_id=NEW.student_id AND e.section_id=NEW.section_id AND e.academic_year_id=NEW.academic_year_id AND y.status NOT IN ('Closed','Archived') AND NEW.local_date BETWEEN y.start_date AND y.end_date) OR NEW.morning NOT IN ('Present','Absent','Late','Excused') OR NOT ((NEW.half_day=0 AND NEW.afternoon=NEW.morning) OR (NEW.half_day=1 AND NEW.morning IN ('Present','Late') AND NEW.afternoon='Absent' AND length(trim(NEW.reason))>=3)) THEN RAISE(ABORT,'ATTENDANCE_SCOPE') END); SELECT (CASE WHEN NEW.version<>COALESCE((SELECT version+1 FROM attendance_days WHERE institution_id=NEW.institution_id AND enrollment_id=NEW.enrollment_id AND local_date=NEW.local_date),1) THEN RAISE(ABORT,'ATTENDANCE_STALE') END); END;
--> statement-breakpoint
CREATE TRIGGER attendance_update_scope BEFORE UPDATE ON attendance_days BEGIN SELECT (CASE WHEN NEW.institution_id<>OLD.institution_id OR NEW.enrollment_id<>OLD.enrollment_id OR NEW.student_id<>OLD.student_id OR NEW.section_id<>OLD.section_id OR NEW.academic_year_id<>OLD.academic_year_id OR NEW.local_date<>OLD.local_date OR NEW.version<>OLD.version+1 OR NEW.morning NOT IN ('Present','Absent','Late','Excused') OR NOT ((NEW.half_day=0 AND NEW.afternoon=NEW.morning) OR (NEW.half_day=1 AND NEW.morning IN ('Present','Late') AND NEW.afternoon='Absent' AND length(trim(NEW.reason))>=3)) OR EXISTS(SELECT 1 FROM academic_years y WHERE y.id=NEW.academic_year_id AND y.status IN ('Closed','Archived')) THEN RAISE(ABORT,'ATTENDANCE_STALE') END); END;
--> statement-breakpoint
CREATE TRIGGER attendance_no_delete BEFORE DELETE ON attendance_days BEGIN SELECT RAISE(ABORT,'ATTENDANCE_HISTORY'); END;
--> statement-breakpoint
CREATE TRIGGER timetable_publish_complete BEFORE UPDATE ON timetables WHEN NEW.status='Published' BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM timetable_slots x WHERE x.timetable_id=NEW.id AND x.institution_id=NEW.institution_id) OR EXISTS(SELECT 1 FROM teaching_assignments a WHERE a.institution_id=NEW.institution_id AND a.academic_year_id=NEW.academic_year_id AND (a.periods_per_week<>(SELECT COUNT(*) FROM timetable_slots x WHERE x.timetable_id=NEW.id AND x.institution_id=NEW.institution_id AND x.assignment_id=a.id) OR NOT EXISTS(SELECT 1 FROM memberships m WHERE m.institution_id=a.institution_id AND m.user_id=a.teacher_id AND m.role='TEACHER' AND m.active=1))) THEN RAISE(ABORT,'TEACHING_SCOPE') END); END;
