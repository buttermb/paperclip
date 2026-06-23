import { z } from "zod";
import {
  SUBSCRIPTION_CREDENTIAL_KINDS,
  SUBSCRIPTION_CREDENTIAL_KINDS_BY_PROVIDER,
  SUBSCRIPTION_CREDENTIAL_PROVIDERS,
  SUBSCRIPTION_CREDENTIAL_STATUSES,
  SUBSCRIPTION_CREDENTIAL_TEST_STATUSES,
  type SubscriptionCredentialProvider,
} from "../constants.js";

export const subscriptionCredentialProviderSchema = z.enum(SUBSCRIPTION_CREDENTIAL_PROVIDERS);
export const subscriptionCredentialKindSchema = z.enum(SUBSCRIPTION_CREDENTIAL_KINDS);
export const subscriptionCredentialStatusSchema = z.enum(SUBSCRIPTION_CREDENTIAL_STATUSES);
export const subscriptionCredentialTestStatusSchema = z.enum(SUBSCRIPTION_CREDENTIAL_TEST_STATUSES);

// Generous upper bound: OAuth tokens are short, but JSON credential documents
// (claude/codex) can carry refresh tokens and account metadata.
const MAX_CREDENTIAL_MATERIAL_LENGTH = 32_768;

const credentialMaterialSchema = z.string().min(1).max(MAX_CREDENTIAL_MATERIAL_LENGTH);

function assertKindMatchesProvider(
  provider: SubscriptionCredentialProvider,
  kind: (typeof SUBSCRIPTION_CREDENTIAL_KINDS)[number],
  ctx: z.RefinementCtx,
) {
  const allowed = SUBSCRIPTION_CREDENTIAL_KINDS_BY_PROVIDER[provider];
  if (!allowed.includes(kind)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["credentialKind"],
      message: `Credential kind "${kind}" is not valid for provider "${provider}"`,
    });
  }
}

// Link (create) or update a credential. Mutations are upserts keyed by
// (company, user, provider): one credential record per provider per user.
export const upsertSubscriptionCredentialSchema = z
  .object({
    provider: subscriptionCredentialProviderSchema,
    credentialKind: subscriptionCredentialKindSchema,
    // Raw credential material (token string or JSON document). Encrypted at
    // rest server-side; never echoed back in any API response.
    material: credentialMaterialSchema,
    status: subscriptionCredentialStatusSchema.optional(),
  })
  .superRefine((value, ctx) => {
    assertKindMatchesProvider(value.provider, value.credentialKind, ctx);
    if (value.credentialKind === "claude_credentials_json" || value.credentialKind === "codex_auth_json") {
      try {
        JSON.parse(value.material);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["material"],
          message: `Credential kind "${value.credentialKind}" requires valid JSON material`,
        });
      }
    }
  });

export type UpsertSubscriptionCredential = z.infer<typeof upsertSubscriptionCredentialSchema>;

// Redacted read model returned by the API. Never includes credential material.
export const subscriptionCredentialReadModelSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  userId: z.string(),
  provider: subscriptionCredentialProviderSchema,
  credentialKind: subscriptionCredentialKindSchema,
  status: subscriptionCredentialStatusSchema,
  testStatus: subscriptionCredentialTestStatusSchema,
  // Non-sensitive hints only (e.g. material length, last 4 chars of a token).
  redactedMetadata: z.record(z.string(), z.unknown()).nullable(),
  lastTestedAt: z.string().datetime().nullable(),
  lastResolvedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SubscriptionCredentialReadModel = z.infer<typeof subscriptionCredentialReadModelSchema>;
