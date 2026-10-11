CREATE TABLE `facility_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`kind` text NOT NULL,
	`student_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`stop_id` text,
	`room_id` text,
	`bed_number` integer,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`next_bill_date` text NOT NULL,
	`charges` text NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stop_id`) REFERENCES `transport_stops`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `hostel_rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `facility_due` ON `facility_allocations` (`institution_id`,`status`,`next_bill_date`);--> statement-breakpoint
CREATE INDEX `facility_student` ON `facility_allocations` (`institution_id`,`student_id`,`academic_year_id`);--> statement-breakpoint
CREATE TABLE `facility_billings` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`allocation_id` text NOT NULL,
	`period` text NOT NULL,
	`invoice_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`allocation_id`) REFERENCES `facility_allocations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `facility_billing_period` ON `facility_billings` (`institution_id`,`allocation_id`,`period`);--> statement-breakpoint
CREATE TABLE `holidays` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `holiday_scope_date` ON `holidays` (`institution_id`,`status`,`start_date`,`end_date`);--> statement-breakpoint
CREATE TABLE `hostel_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hostel_block_name` ON `hostel_blocks` (`institution_id`,`name`);--> statement-breakpoint
CREATE TABLE `hostel_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`block_id` text NOT NULL,
	`name` text NOT NULL,
	`capacity` integer NOT NULL,
	`boarding_paise` integer NOT NULL,
	`mess_paise` integer NOT NULL,
	`boarding_component_id` text NOT NULL,
	`mess_component_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`block_id`) REFERENCES `hostel_blocks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`boarding_component_id`) REFERENCES `fee_components`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mess_component_id`) REFERENCES `fee_components`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hostel_room_name` ON `hostel_rooms` (`institution_id`,`block_id`,`name`);--> statement-breakpoint
CREATE TABLE `transport_routes` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`name` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `transport_vehicles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transport_route_name` ON `transport_routes` (`institution_id`,`name`);--> statement-breakpoint
CREATE TABLE `transport_stops` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`route_id` text NOT NULL,
	`name` text NOT NULL,
	`distance_km` integer DEFAULT 0 NOT NULL,
	`monthly_paise` integer NOT NULL,
	`component_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`route_id`) REFERENCES `transport_routes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`component_id`) REFERENCES `fee_components`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transport_stop_name` ON `transport_stops` (`institution_id`,`route_id`,`name`);--> statement-breakpoint
CREATE TABLE `transport_vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`registration` text NOT NULL,
	`driver_name` text NOT NULL,
	`driver_mobile` text NOT NULL,
	`capacity` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicle_registration` ON `transport_vehicles` (`institution_id`,`registration`);--> statement-breakpoint
ALTER TABLE `institutions` ADD `razorpay_credentials` text;--> statement-breakpoint
ALTER TABLE `institutions` ADD `cashfree_credentials` text;
--> statement-breakpoint
UPDATE institutions SET razorpay_credentials=(SELECT ciphertext FROM provider_configs WHERE institution_id=institutions.id AND provider='Razorpay'), cashfree_credentials=(SELECT ciphertext FROM provider_configs WHERE institution_id=institutions.id AND provider='Cashfree');
--> statement-breakpoint
UPDATE provider_configs SET ciphertext='' WHERE provider IN ('Razorpay','Cashfree');
--> statement-breakpoint
CREATE TRIGGER scope_transport_routes_insert BEFORE INSERT ON transport_routes BEGIN SELECT (CASE WHEN NEW.vehicle_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM transport_vehicles WHERE id=NEW.vehicle_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_transport_routes_update BEFORE UPDATE ON transport_routes BEGIN SELECT (CASE WHEN NEW.vehicle_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM transport_vehicles WHERE id=NEW.vehicle_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_transport_stops_insert BEFORE INSERT ON transport_stops BEGIN SELECT (CASE WHEN NEW.route_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM transport_routes WHERE id=NEW.route_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.component_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_components WHERE id=NEW.component_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_transport_stops_update BEFORE UPDATE ON transport_stops BEGIN SELECT (CASE WHEN NEW.route_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM transport_routes WHERE id=NEW.route_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.component_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_components WHERE id=NEW.component_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_hostel_rooms_insert BEFORE INSERT ON hostel_rooms BEGIN SELECT (CASE WHEN NEW.block_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hostel_blocks WHERE id=NEW.block_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.boarding_component_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_components WHERE id=NEW.boarding_component_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.mess_component_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_components WHERE id=NEW.mess_component_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_hostel_rooms_update BEFORE UPDATE ON hostel_rooms BEGIN SELECT (CASE WHEN NEW.block_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hostel_blocks WHERE id=NEW.block_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.boarding_component_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_components WHERE id=NEW.boarding_component_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.mess_component_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_components WHERE id=NEW.mess_component_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_facility_allocations_insert BEFORE INSERT ON facility_allocations BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students WHERE id=NEW.student_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years WHERE id=NEW.academic_year_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.stop_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM transport_stops WHERE id=NEW.stop_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.room_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hostel_rooms WHERE id=NEW.room_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_facility_allocations_update BEFORE UPDATE ON facility_allocations BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students WHERE id=NEW.student_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years WHERE id=NEW.academic_year_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.stop_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM transport_stops WHERE id=NEW.stop_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.room_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hostel_rooms WHERE id=NEW.room_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_facility_billings_insert BEFORE INSERT ON facility_billings BEGIN SELECT (CASE WHEN NEW.allocation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM facility_allocations WHERE id=NEW.allocation_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invoices WHERE id=NEW.invoice_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_facility_billings_update BEFORE UPDATE ON facility_billings BEGIN SELECT (CASE WHEN NEW.allocation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM facility_allocations WHERE id=NEW.allocation_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invoices WHERE id=NEW.invoice_id AND institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER facility_allocation_scope BEFORE INSERT ON facility_allocations BEGIN SELECT (CASE WHEN NEW.kind NOT IN ('Transport','Hostel') OR NEW.status<>'Active' OR NEW.start_date>NEW.end_date OR NEW.next_bill_date<>NEW.start_date OR NOT EXISTS(SELECT 1 FROM academic_years y JOIN enrollments e ON e.academic_year_id=y.id AND e.institution_id=y.institution_id JOIN students s ON s.id=e.student_id AND s.institution_id=e.institution_id WHERE y.id=NEW.academic_year_id AND y.institution_id=NEW.institution_id AND e.student_id=NEW.student_id AND s.status='Active' AND y.status IN ('Draft','Active') AND NEW.start_date>=y.start_date AND NEW.end_date<=y.end_date) OR (NEW.kind='Transport' AND (NEW.stop_id IS NULL OR NEW.room_id IS NOT NULL OR NEW.bed_number IS NOT NULL)) OR (NEW.kind='Hostel' AND (NEW.room_id IS NULL OR NEW.stop_id IS NOT NULL OR typeof(NEW.bed_number)<>'integer' OR NEW.bed_number<1 OR NEW.bed_number>(SELECT capacity FROM hostel_rooms WHERE id=NEW.room_id))) THEN RAISE(ABORT,'FACILITY_SCOPE') END); SELECT (CASE WHEN EXISTS(SELECT 1 FROM facility_allocations a WHERE a.institution_id=NEW.institution_id AND a.student_id=NEW.student_id AND a.kind=NEW.kind AND a.status='Active' AND a.start_date<=NEW.end_date AND a.end_date>=NEW.start_date) THEN RAISE(ABORT,'FACILITY_ALREADY_ALLOCATED') END); END;
--> statement-breakpoint
CREATE TRIGGER hostel_bed_capacity BEFORE INSERT ON facility_allocations WHEN NEW.kind='Hostel' BEGIN SELECT (CASE WHEN EXISTS(SELECT 1 FROM facility_allocations a WHERE a.institution_id=NEW.institution_id AND a.room_id=NEW.room_id AND a.bed_number=NEW.bed_number AND a.status='Active' AND a.start_date<=NEW.end_date AND a.end_date>=NEW.start_date) THEN RAISE(ABORT,'FACILITY_BED_OCCUPIED') END); END;
--> statement-breakpoint
CREATE TRIGGER transport_seat_capacity BEFORE INSERT ON facility_allocations WHEN NEW.kind='Transport' BEGIN SELECT (CASE WHEN (SELECT COUNT(*) FROM facility_allocations a JOIN transport_stops s ON s.id=a.stop_id JOIN transport_routes r ON r.id=s.route_id WHERE a.institution_id=NEW.institution_id AND a.status='Active' AND a.start_date<=NEW.end_date AND a.end_date>=NEW.start_date AND r.vehicle_id=(SELECT r2.vehicle_id FROM transport_stops s2 JOIN transport_routes r2 ON r2.id=s2.route_id WHERE s2.id=NEW.stop_id)) >= (SELECT v.capacity FROM transport_stops s JOIN transport_routes r ON r.id=s.route_id JOIN transport_vehicles v ON v.id=r.vehicle_id WHERE s.id=NEW.stop_id) THEN RAISE(ABORT,'FACILITY_VEHICLE_FULL') END); END;
--> statement-breakpoint
CREATE TRIGGER facility_allocation_history BEFORE UPDATE ON facility_allocations WHEN NEW.institution_id<>OLD.institution_id OR NEW.student_id<>OLD.student_id OR NEW.academic_year_id<>OLD.academic_year_id OR NEW.kind<>OLD.kind OR COALESCE(NEW.stop_id,'')<>COALESCE(OLD.stop_id,'') OR COALESCE(NEW.room_id,'')<>COALESCE(OLD.room_id,'') OR COALESCE(NEW.bed_number,0)<>COALESCE(OLD.bed_number,0) OR NEW.charges<>OLD.charges OR NEW.start_date<>OLD.start_date OR NEW.end_date<>OLD.end_date OR OLD.status='Ended' OR NEW.status NOT IN ('Active','Ended') BEGIN SELECT RAISE(ABORT,'FACILITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER facility_billing_scope BEFORE INSERT ON facility_billings BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM facility_allocations a JOIN invoices i ON i.id=NEW.invoice_id AND i.institution_id=a.institution_id WHERE a.id=NEW.allocation_id AND a.institution_id=NEW.institution_id AND a.status='Active' AND i.student_id=a.student_id AND i.academic_year_id=a.academic_year_id AND NEW.period=substr(a.next_bill_date,1,7) AND i.due_date=a.next_bill_date AND i.net_paise=(SELECT SUM(json_extract(value,'$.amountPaise')) FROM json_each(a.charges))) THEN RAISE(ABORT,'FACILITY_BILLING_SCOPE') END); END;
--> statement-breakpoint
CREATE TRIGGER facility_billings_no_delete BEFORE DELETE ON facility_billings BEGIN SELECT RAISE(ABORT,'FACILITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER facility_allocations_no_delete BEFORE DELETE ON facility_allocations BEGIN SELECT RAISE(ABORT,'FACILITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER facility_billings_no_update BEFORE UPDATE ON facility_billings BEGIN SELECT RAISE(ABORT,'FACILITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER transport_vehicles_valid BEFORE INSERT ON transport_vehicles WHEN typeof(NEW.capacity)<>'integer' OR NEW.capacity<1 BEGIN SELECT RAISE(ABORT,'FACILITY_SCOPE'); END;
--> statement-breakpoint
CREATE TRIGGER hostel_rooms_valid BEFORE INSERT ON hostel_rooms WHEN typeof(NEW.capacity)<>'integer' OR NEW.capacity<1 BEGIN SELECT RAISE(ABORT,'FACILITY_SCOPE'); END;
--> statement-breakpoint
CREATE TRIGGER transport_stops_valid BEFORE INSERT ON transport_stops WHEN typeof(NEW.monthly_paise)<>'integer' OR NEW.monthly_paise<1 BEGIN SELECT RAISE(ABORT,'FACILITY_SCOPE'); END;
--> statement-breakpoint
CREATE TRIGGER holiday_attendance BEFORE INSERT ON attendance_days WHEN EXISTS(SELECT 1 FROM holidays h WHERE h.status='Active' AND (h.institution_id IS NULL OR h.institution_id=NEW.institution_id) AND h.start_date<=NEW.local_date AND h.end_date>=NEW.local_date) BEGIN SELECT RAISE(ABORT,'HOLIDAY_NO_ATTENDANCE'); END;
--> statement-breakpoint
CREATE TRIGGER holiday_attendance_update BEFORE UPDATE ON attendance_days WHEN EXISTS(SELECT 1 FROM holidays h WHERE h.status='Active' AND (h.institution_id IS NULL OR h.institution_id=NEW.institution_id) AND h.start_date<=NEW.local_date AND h.end_date>=NEW.local_date) BEGIN SELECT RAISE(ABORT,'HOLIDAY_NO_ATTENDANCE'); END;
