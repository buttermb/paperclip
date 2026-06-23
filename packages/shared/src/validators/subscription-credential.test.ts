import { describe, expect, it } from "vitest";
import {
  subscriptionCredentialProviderSchema,
  subscriptionCredentialKindSchema,
  upsertSubscriptionCredentialSchema,
} from "./subscription-credential.js";

describe("subscription credential validators", () => {
  describe("provider schema", () => {
    it("accepts valid providers", () => {
      expect(subscriptionCredentialProviderSchema.parse("claude")).toBe("claude");
      expect(subscriptionCredentialProviderSchema.parse("codex")).toBe("codex");
    });

    it("rejects unknown providers", () => {
      expect(() => subscriptionCredentialProviderSchema.parse("openai")).toThrow();
      expect(() => subscriptionCredentialProviderSchema.parse("")).toThrow();
    });
  });

  describe("kind schema", () => {
    it("accepts all valid credential kinds", () => {
      expect(subscriptionCredentialKindSchema.parse("claude_oauth_token")).toBe("claude_oauth_token");
      expect(subscriptionCredentialKindSchema.parse("claude_credentials_json")).toBe("claude_credentials_json");
      expect(subscriptionCredentialKindSchema.parse("codex_auth_json")).toBe("codex_auth_json");
    });

    it("rejects unknown kinds", () => {
      expect(() => subscriptionCredentialKindSchema.parse("openai_api_key")).toThrow();
    });
  });

  describe("upsertSubscriptionCredentialSchema", () => {
    it("accepts a valid claude oauth token", () => {
      const input = {
        provider: "claude",
        credentialKind: "claude_oauth_token",
        material: "sk-ant-token-placeholder",
      };
      expect(() => upsertSubscriptionCredentialSchema.parse(input)).not.toThrow();
      const parsed = upsertSubscriptionCredentialSchema.parse(input);
      expect(parsed.provider).toBe("claude");
      expect(parsed.credentialKind).toBe("claude_oauth_token");
    });

    it("accepts a valid claude_credentials_json with well-formed JSON", () => {
      const creds = JSON.stringify({
        claudeAiOauth: {
          accessToken: "tok",
          refreshToken: "ref",
          expiresAt: Date.now() + 3600000,
        },
      });
      const input = {
        provider: "claude",
        credentialKind: "claude_credentials_json",
        material: creds,
      };
      expect(() => upsertSubscriptionCredentialSchema.parse(input)).not.toThrow();
    });

    it("rejects claude_credentials_json with non-JSON material", () => {
      const result = upsertSubscriptionCredentialSchema.safeParse({
        provider: "claude",
        credentialKind: "claude_credentials_json",
        material: "not-json",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join("."));
        expect(paths).toContain("material");
      }
    });

    it("accepts a valid codex_auth_json with well-formed JSON", () => {
      const auth = JSON.stringify({ accessToken: "tok", refreshToken: "ref" });
      const input = {
        provider: "codex",
        credentialKind: "codex_auth_json",
        material: auth,
      };
      expect(() => upsertSubscriptionCredentialSchema.parse(input)).not.toThrow();
    });

    it("rejects codex_auth_json with non-JSON material", () => {
      const result = upsertSubscriptionCredentialSchema.safeParse({
        provider: "codex",
        credentialKind: "codex_auth_json",
        material: "not-valid-json",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a codex credential kind for the claude provider", () => {
      const result = upsertSubscriptionCredentialSchema.safeParse({
        provider: "claude",
        credentialKind: "codex_auth_json",
        material: "{}",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join("."));
        expect(paths).toContain("credentialKind");
      }
    });

    it("rejects a claude credential kind for the codex provider", () => {
      const result = upsertSubscriptionCredentialSchema.safeParse({
        provider: "codex",
        credentialKind: "claude_oauth_token",
        material: "some-token",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty material", () => {
      const result = upsertSubscriptionCredentialSchema.safeParse({
        provider: "claude",
        credentialKind: "claude_oauth_token",
        material: "",
      });
      expect(result.success).toBe(false);
    });

    it("accepts an optional disabled status", () => {
      const parsed = upsertSubscriptionCredentialSchema.parse({
        provider: "claude",
        credentialKind: "claude_oauth_token",
        material: "some-token",
        status: "disabled",
      });
      expect(parsed.status).toBe("disabled");
    });

    it("rejects an invalid status value", () => {
      const result = upsertSubscriptionCredentialSchema.safeParse({
        provider: "claude",
        credentialKind: "claude_oauth_token",
        material: "some-token",
        status: "pending",
      });
      expect(result.success).toBe(false);
    });

    it("rejects material that exceeds the maximum length", () => {
      const result = upsertSubscriptionCredentialSchema.safeParse({
        provider: "claude",
        credentialKind: "claude_oauth_token",
        // 32769 chars > MAX_CREDENTIAL_MATERIAL_LENGTH
        material: "x".repeat(32_769),
      });
      expect(result.success).toBe(false);
    });
  });
});
