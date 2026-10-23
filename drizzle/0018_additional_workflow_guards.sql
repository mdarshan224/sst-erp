-- Guard new writes without deleting/merging historical duplicate sections.
CREATE VIEW section_name_keys AS SELECT id,institution_id,academic_year_id,class_id,campus_id,lower(trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(name,char(9),' '),char(10),' '),char(13),' '),char(160),' '),'  ',' '),'  ',' '),'  ',' '),'  ',' '),'  ',' '),'  ',' '),'  ',' '),'  ',' '))) AS name_key FROM sections;
--> statement-breakpoint
CREATE TRIGGER section_unique_insert BEFORE INSERT ON sections BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM section_name_keys s WHERE s.id<>NEW.id AND s.institution_id=NEW.institution_id AND s.academic_year_id=NEW.academic_year_id AND s.class_id=NEW.class_id AND s.campus_id IS NEW.campus_id AND s.name_key=lower(trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(NEW.name,char(9),' '),char(10),' '),char(13),' '),char(160),' '),'  ',' '),'  ',' '),'  ',' '),'  ',' '),'  ',' '),'  ',' '),'  ',' '),'  ',' ')))) THEN RAISE(ABORT,'SECTION_DUPLICATE') END; END;
--> statement-breakpoint
CREATE TRIGGER section_unique_update BEFORE UPDATE OF name,institution_id,academic_year_id,class_id,campus_id ON sections BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM section_name_keys s WHERE s.id<>NEW.id AND s.institution_id=NEW.institution_id AND s.academic_year_id=NEW.academic_year_id AND s.class_id=NEW.class_id AND s.campus_id IS NEW.campus_id AND s.name_key=lower(trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(NEW.name,char(9),' '),char(10),' '),char(13),' '),char(160),' '),'  ',' '),'  ',' '),'  ',' '),'  ',' '),'  ',' '),'  ',' '),'  ',' '),'  ',' ')))) THEN RAISE(ABORT,'SECTION_DUPLICATE') END; END;
--> statement-breakpoint
CREATE TABLE `teaching_staff` (
	`institution_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`institution_id`, `user_id`),
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
DROP TRIGGER teaching_assignment_scope;
--> statement-breakpoint
CREATE TRIGGER teaching_assignment_scope BEFORE INSERT ON teaching_assignments BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM sections s JOIN academic_years y ON y.id=s.academic_year_id AND y.institution_id=s.institution_id JOIN teaching_subjects sub ON sub.id=NEW.subject_id AND sub.institution_id=s.institution_id JOIN memberships m ON m.institution_id=s.institution_id AND m.user_id=NEW.teacher_id AND m.active=1 AND (m.role='TEACHER' OR (m.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') AND EXISTS(SELECT 1 FROM teaching_staff f WHERE f.institution_id=m.institution_id AND f.user_id=m.user_id))) WHERE s.id=NEW.section_id AND s.institution_id=NEW.institution_id AND y.id=NEW.academic_year_id AND y.status NOT IN ('Closed','Archived')) OR NEW.periods_per_week NOT BETWEEN 1 AND 20 THEN RAISE(ABORT,'TEACHING_SCOPE') END); END;
--> statement-breakpoint
DROP TRIGGER timetable_publish_complete;
--> statement-breakpoint
CREATE TRIGGER timetable_publish_complete BEFORE UPDATE ON timetables WHEN NEW.status='Published' BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM timetable_slots x WHERE x.timetable_id=NEW.id AND x.institution_id=NEW.institution_id) OR EXISTS(SELECT 1 FROM teaching_assignments a WHERE a.institution_id=NEW.institution_id AND a.academic_year_id=NEW.academic_year_id AND (a.periods_per_week<>(SELECT COUNT(*) FROM timetable_slots x WHERE x.timetable_id=NEW.id AND x.institution_id=NEW.institution_id AND x.assignment_id=a.id) OR NOT EXISTS(SELECT 1 FROM memberships m WHERE m.institution_id=a.institution_id AND m.user_id=a.teacher_id AND (m.role='TEACHER' OR (m.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') AND EXISTS(SELECT 1 FROM teaching_staff f WHERE f.institution_id=m.institution_id AND f.user_id=m.user_id))) AND m.active=1))) THEN RAISE(ABORT,'TEACHING_SCOPE') END); END;
--> statement-breakpoint
CREATE TRIGGER institution_slug_case_insert BEFORE INSERT ON institutions BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id<>NEW.id AND lower(i.slug)=lower(NEW.slug)) THEN RAISE(ABORT,'UNIQUE institution slug') END; END;
--> statement-breakpoint
CREATE TRIGGER institution_slug_case_update BEFORE UPDATE OF slug ON institutions BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM institutions i WHERE i.id<>NEW.id AND lower(i.slug)=lower(NEW.slug)) THEN RAISE(ABORT,'UNIQUE institution slug') END; END;
--> statement-breakpoint
