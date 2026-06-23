import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { authUsers } from "./auth.js";

/**
 * Per-user "bring your own" subscription credential storage for the official
 * Claude / Codex CLI binaries. Scoped by company + user + provider so a single
 * employee holds at most one credential record per provider per company.
 *
 * The encrypted credential payload lives in `material` (the same encrypted
 * envelope shape produced by the secret provider modules, e.g.
 * `{ scheme, iv, tag, ciphertext }` for `local_encrypted`). Plaintext credential
 * material is never stored here and is never returned through the API.
 */
export const userSubscriptionCredentials = pgTable(
  "user_subscription_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    // "claude" | "codex"
    provider: text("provider").notNull(),
    // Provider-specific credential shape, e.g. "claude_oauth_token",
    // "claude_credentials_json", "codex_auth_json".
    credentialKind: text("credential_kind").notNull(),
    // Encryption provider that produced `material` (e.g. "local_encrypted").
    secretProvider: text("secret_provider").notNull().default("local_encrypted"),
    // Encrypted-at-rest credential envelope. Never plaintext.
    material: jsonb("material").$type<Record<string, unknown>>().notNull(),
    // SHA-256 of the plaintext credential, for change detection / audit only.
    valueSha256: text("value_sha256").notNull(),
    // Non-sensitive redacted preview metadata (e.g. token length, suffix hint).
    redactedMetadata: jsonb("redacted_metadata").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("active"),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastTestStatus: text("last_test_status"),
    lastResolvedAt: timestamp("last_resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("user_subscription_credentials_company_idx").on(table.companyId),
    companyUserIdx: index("user_subscription_credentials_company_user_idx").on(
      table.companyId,
      table.userId,
    ),
    companyUserProviderUq: uniqueIndex("user_subscription_credentials_company_user_provider_uq").on(
      table.companyId,
      table.userId,
      table.provider,
    ),
  }),
);
