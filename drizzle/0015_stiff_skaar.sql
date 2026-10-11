CREATE TABLE `billing_events` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`order_id` text NOT NULL,
	`gateway` text NOT NULL,
	`event_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `billing_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_event_key` ON `billing_events` (`gateway`,`event_id`);
--> statement-breakpoint
CREATE TABLE `billing_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`plan_snapshot` text NOT NULL,
	`subscription_version` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`gateway` text NOT NULL,
	`gateway_order_id` text,
	`gateway_transaction_id` text,
	`checkout` text,
	`status` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`payment_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subscription_id`) REFERENCES `institution_subscriptions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plan_id`) REFERENCES `saas_plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `subscription_payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_request_key` ON `billing_orders` (`institution_id`,`idempotency_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_gateway_order` ON `billing_orders` (`gateway`,`gateway_order_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_gateway_transaction` ON `billing_orders` (`gateway`,`gateway_transaction_id`);
--> statement-breakpoint
CREATE INDEX `billing_tenant_history` ON `billing_orders` (`institution_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `billing_postings` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`order_id` text NOT NULL,
	`account` text NOT NULL,
	`debit_paise` integer NOT NULL,
	`credit_paise` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `billing_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_posting_account` ON `billing_postings` (`order_id`,`account`);
--> statement-breakpoint
CREATE UNIQUE INDEX billing_one_pending ON billing_orders(institution_id) WHERE status IN ('Initiated','Processing');
--> statement-breakpoint
CREATE TRIGGER billing_order_scope BEFORE INSERT ON billing_orders BEGIN SELECT (CASE WHEN NEW.amount_paise<=0 OR NOT EXISTS(SELECT 1 FROM institution_subscriptions s JOIN institutions i ON i.id=s.institution_id WHERE s.id=NEW.subscription_id AND s.institution_id=NEW.institution_id AND i.status='Active') THEN RAISE(ABORT,'BILLING_SCOPE') END); END;
--> statement-breakpoint
CREATE TRIGGER billing_order_immutable BEFORE UPDATE OF institution_id,subscription_id,plan_id,plan_snapshot,subscription_version,amount_paise,gateway,idempotency_key,request_hash,created_at,created_by ON billing_orders BEGIN SELECT RAISE(ABORT,'IMMUTABLE_BILLING_ORDER'); END;
--> statement-breakpoint
CREATE TRIGGER billing_settled_immutable BEFORE UPDATE OF gateway_transaction_id,payment_id,gateway_order_id ON billing_orders WHEN OLD.status='Successful' AND (NEW.gateway_transaction_id IS NOT OLD.gateway_transaction_id OR NEW.payment_id IS NOT OLD.payment_id OR NEW.gateway_order_id IS NOT OLD.gateway_order_id) BEGIN SELECT RAISE(ABORT,'IMMUTABLE_BILLING_ORDER'); END;
--> statement-breakpoint
CREATE TRIGGER billing_settled_status BEFORE UPDATE OF status ON billing_orders WHEN OLD.status='Successful' AND NEW.status!='Successful' BEGIN SELECT RAISE(ABORT,'IMMUTABLE_BILLING_ORDER'); END;
--> statement-breakpoint
CREATE TRIGGER billing_settlement_complete BEFORE UPDATE OF status ON billing_orders WHEN OLD.status='Successful' AND NEW.status='Successful' BEGIN SELECT (CASE WHEN (SELECT COUNT(*) FROM billing_postings p WHERE p.order_id=NEW.id)!=2 OR (SELECT COALESCE(SUM(p.debit_paise-p.credit_paise),1) FROM billing_postings p WHERE p.order_id=NEW.id)!=0 OR NOT EXISTS(SELECT 1 FROM subscription_payments p WHERE p.id=NEW.payment_id AND p.institution_id=NEW.institution_id AND p.amount_paise=NEW.amount_paise) OR NOT EXISTS(SELECT 1 FROM institution_subscriptions s WHERE s.id=NEW.subscription_id AND s.institution_id=NEW.institution_id AND s.plan_id=NEW.plan_id AND s.status='Active' AND s.start_date=json_extract(NEW.plan_snapshot,'$.effectiveStartDate') AND s.end_date=json_extract(NEW.plan_snapshot,'$.endDate') AND s.student_limit=json_extract(NEW.plan_snapshot,'$.student_limit') AND s.user_limit=json_extract(NEW.plan_snapshot,'$.user_limit') AND s.modules=json_extract(NEW.plan_snapshot,'$.modules')) OR NOT EXISTS(SELECT 1 FROM institutions i WHERE i.id=NEW.institution_id AND i.status='Active') THEN RAISE(ABORT,'BILLING_SETTLEMENT_CONFLICT') END); END;
--> statement-breakpoint
CREATE TRIGGER billing_posting_scope BEFORE INSERT ON billing_postings BEGIN SELECT (CASE WHEN NEW.debit_paise<0 OR NEW.credit_paise<0 OR (NEW.debit_paise>0)=(NEW.credit_paise>0) OR NOT EXISTS(SELECT 1 FROM billing_orders b WHERE b.id=NEW.order_id AND b.institution_id=NEW.institution_id AND b.status='Successful' AND NEW.debit_paise+NEW.credit_paise=b.amount_paise) THEN RAISE(ABORT,'BILLING_POSTING_MISMATCH') END); END;
--> statement-breakpoint
CREATE TRIGGER billing_postings_no_update BEFORE UPDATE ON billing_postings BEGIN SELECT RAISE(ABORT,'IMMUTABLE_BILLING_LEDGER'); END;
--> statement-breakpoint
CREATE TRIGGER billing_postings_no_delete BEFORE DELETE ON billing_postings BEGIN SELECT RAISE(ABORT,'IMMUTABLE_BILLING_LEDGER'); END;
--> statement-breakpoint
CREATE TRIGGER billing_events_no_update BEFORE UPDATE ON billing_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE_BILLING_EVENT'); END;
--> statement-breakpoint
CREATE TRIGGER billing_events_no_delete BEFORE DELETE ON billing_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE_BILLING_EVENT'); END;
--> statement-breakpoint
CREATE TRIGGER billing_orders_no_delete BEFORE DELETE ON billing_orders BEGIN SELECT RAISE(ABORT,'IMMUTABLE_BILLING_ORDER'); END;
--> statement-breakpoint
CREATE TRIGGER subscription_payments_no_update BEFORE UPDATE ON subscription_payments BEGIN SELECT RAISE(ABORT,'IMMUTABLE_SUBSCRIPTION_PAYMENT'); END;
--> statement-breakpoint
CREATE TRIGGER subscription_payments_no_delete BEFORE DELETE ON subscription_payments BEGIN SELECT RAISE(ABORT,'IMMUTABLE_SUBSCRIPTION_PAYMENT'); END;

--> statement-breakpoint
CREATE TRIGGER billing_event_scope BEFORE INSERT ON billing_events BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM billing_orders b WHERE b.id=NEW.order_id AND b.institution_id=NEW.institution_id AND b.gateway=NEW.gateway AND b.status='Successful') THEN RAISE(ABORT,'BILLING_EVENT_SCOPE') END); END;
