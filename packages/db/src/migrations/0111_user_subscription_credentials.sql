CREATE TABLE IF NOT EXISTS "user_subscription_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "provider" text NOT NULL,
  "credential_kind" text NOT NULL,
  "secret_provider" text DEFAULT 'local_encrypted' NOT NULL,
  "material" jsonb NOT NULL,
  "value_sha256" text NOT NULL,
  "redacted_metadata" jsonb,
  "status" text DEFAULT 'active' NOT NULL,
  "last_tested_at" timestamp with time zone,
  "last_test_status" text,
  "last_resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_subscription_credentials" ADD CONSTRAINT "user_subscription_credentials_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_subscription_credentials" ADD CONSTRAINT "user_subscription_credentials_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_subscription_credentials_company_idx"
  ON "user_subscription_credentials" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_subscription_credentials_company_user_idx"
  ON "user_subscription_credentials" USING btree ("company_id","user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_subscription_credentials_company_user_provider_uq"
  ON "user_subscription_credentials" USING btree ("company_id","user_id","provider");
