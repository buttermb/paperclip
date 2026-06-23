import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { subscriptionCredentialRoutes } from "../routes/subscription-credentials.js";
import { errorHandler } from "../middleware/error-handler.js";
import { HttpError } from "../errors.js";

const mockSvc = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  recordTestResult: vi.fn(),
  resolveDecryptedMaterial: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  subscriptionCredentialService: () => mockSvc,
  logActivity: mockLogActivity,
}));

const BOARD_ACTOR = {
  type: "board",
  userId: "user-1",
  source: "session",
  companyIds: ["company-1"],
  memberships: [{ companyId: "company-1", status: "active", membershipRole: "admin" }],
};

const AGENT_ACTOR = {
  type: "agent",
  agentId: "agent-1",
  companyId: "company-1",
};

function createApp(actor: Record<string, unknown> = BOARD_ACTOR) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", subscriptionCredentialRoutes({} as any));
  app.use(errorHandler);
  return app;
}

const REDACTED_CREDENTIAL = {
  id: "cred-uuid-1",
  companyId: "company-1",
  userId: "user-1",
  provider: "claude",
  credentialKind: "claude_oauth_token",
  status: "active",
  testStatus: "untested",
  redactedMetadata: { kind: "claude_oauth_token", materialLength: 40, tokenSuffix: "abcd" },
  lastTestedAt: null,
  lastResolvedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("subscription credential routes", () => {
  beforeEach(() => {
    for (const mock of Object.values(mockSvc)) {
      mock.mockReset();
    }
    mockLogActivity.mockReset();
    mockLogActivity.mockResolvedValue(undefined);
  });

  // ─── LIST ────────────────────────────────────────────────────────────────

  it("lists redacted credentials for a board user", async () => {
    mockSvc.list.mockResolvedValue([REDACTED_CREDENTIAL]);

    const res = await request(createApp())
      .get("/api/companies/company-1/subscription-credentials");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([REDACTED_CREDENTIAL]);
    expect(mockSvc.list).toHaveBeenCalledWith("company-1", "user-1");
  });

  it("rejects list for agent actors (no board user context)", async () => {
    const res = await request(createApp(AGENT_ACTOR))
      .get("/api/companies/company-1/subscription-credentials");

    expect(res.status).toBe(403);
    expect(mockSvc.list).not.toHaveBeenCalled();
  });

  it("rejects list for cross-company board actors", async () => {
    const res = await request(createApp({
      ...BOARD_ACTOR,
      companyIds: ["company-2"],
      memberships: [{ companyId: "company-2", status: "active", membershipRole: "admin" }],
    })).get("/api/companies/company-1/subscription-credentials");

    expect(res.status).toBe(403);
    expect(mockSvc.list).not.toHaveBeenCalled();
  });

  // ─── GET BY ID ───────────────────────────────────────────────────────────

  it("returns a single redacted credential", async () => {
    mockSvc.getById.mockResolvedValue(REDACTED_CREDENTIAL);

    const res = await request(createApp())
      .get("/api/companies/company-1/subscription-credentials/cred-uuid-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(REDACTED_CREDENTIAL);
    expect(mockSvc.getById).toHaveBeenCalledWith("company-1", "user-1", "cred-uuid-1");
  });

  it("returns 404 for unknown credentials", async () => {
    mockSvc.getById.mockRejectedValue(
      new HttpError(404, "Subscription credential not found"),
    );

    const res = await request(createApp())
      .get("/api/companies/company-1/subscription-credentials/nonexistent");

    expect(res.status).toBe(404);
    expect(mockSvc.getById).toHaveBeenCalled();
  });

  // ─── UPSERT (PUT) ────────────────────────────────────────────────────────

  it("links a claude oauth token credential", async () => {
    mockSvc.upsert.mockResolvedValue(REDACTED_CREDENTIAL);

    const res = await request(createApp())
      .put("/api/companies/company-1/subscription-credentials")
      .send({
        provider: "claude",
        credentialKind: "claude_oauth_token",
        material: "sk-ant-oauthtoken-very-long-placeholder-value-here",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(REDACTED_CREDENTIAL);
    expect(mockSvc.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        userId: "user-1",
        provider: "claude",
        credentialKind: "claude_oauth_token",
        material: "sk-ant-oauthtoken-very-long-placeholder-value-here",
      }),
    );
    // Audit log must be called with no credential material
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "subscription_credential.linked",
        entityType: "subscription_credential",
        details: expect.not.objectContaining({ material: expect.anything() }),
      }),
    );
  });

  it("links a codex_auth_json credential with valid JSON material", async () => {
    const codexCred = {
      ...REDACTED_CREDENTIAL,
      provider: "codex",
      credentialKind: "codex_auth_json",
    };
    mockSvc.upsert.mockResolvedValue(codexCred);

    const codexJson = JSON.stringify({ accessToken: "tok", refreshToken: "ref", expiresAt: 9999 });

    const res = await request(createApp())
      .put("/api/companies/company-1/subscription-credentials")
      .send({
        provider: "codex",
        credentialKind: "codex_auth_json",
        material: codexJson,
      });

    expect(res.status).toBe(200);
    expect(mockSvc.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "codex", credentialKind: "codex_auth_json" }),
    );
  });

  it("rejects a credentials_json kind with non-JSON material", async () => {
    const res = await request(createApp())
      .put("/api/companies/company-1/subscription-credentials")
      .send({
        provider: "claude",
        credentialKind: "claude_credentials_json",
        material: "this-is-not-json",
      });

    expect(res.status).toBe(400);
    expect(mockSvc.upsert).not.toHaveBeenCalled();
  });

  it("rejects mismatched provider/kind (claude provider + codex kind)", async () => {
    const res = await request(createApp())
      .put("/api/companies/company-1/subscription-credentials")
      .send({
        provider: "claude",
        credentialKind: "codex_auth_json",
        material: "{}",
      });

    expect(res.status).toBe(400);
    expect(mockSvc.upsert).not.toHaveBeenCalled();
  });

  it("rejects upsert for agent actors", async () => {
    const res = await request(createApp(AGENT_ACTOR))
      .put("/api/companies/company-1/subscription-credentials")
      .send({
        provider: "claude",
        credentialKind: "claude_oauth_token",
        material: "sometoken",
      });

    expect(res.status).toBe(403);
    expect(mockSvc.upsert).not.toHaveBeenCalled();
  });

  it("rejects upsert for unknown providers", async () => {
    const res = await request(createApp())
      .put("/api/companies/company-1/subscription-credentials")
      .send({
        provider: "openai",
        credentialKind: "claude_oauth_token",
        material: "sometoken",
      });

    expect(res.status).toBe(400);
    expect(mockSvc.upsert).not.toHaveBeenCalled();
  });

  // ─── TEST RESULT ─────────────────────────────────────────────────────────

  it("records a test result for a credential", async () => {
    const tested = { ...REDACTED_CREDENTIAL, testStatus: "ready", lastTestedAt: "2026-01-02T00:00:00.000Z" };
    mockSvc.recordTestResult.mockResolvedValue(tested);

    const res = await request(createApp())
      .post("/api/companies/company-1/subscription-credentials/cred-uuid-1/test-result")
      .send({ testStatus: "ready" });

    expect(res.status).toBe(200);
    expect(res.body.testStatus).toBe("ready");
    expect(mockSvc.recordTestResult).toHaveBeenCalledWith(
      "company-1",
      "user-1",
      "cred-uuid-1",
      "ready",
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "subscription_credential.tested" }),
    );
  });

  it("rejects an invalid test status value", async () => {
    const res = await request(createApp())
      .post("/api/companies/company-1/subscription-credentials/cred-uuid-1/test-result")
      .send({ testStatus: "passing" });

    expect(res.status).toBe(400);
    expect(mockSvc.recordTestResult).not.toHaveBeenCalled();
  });

  // ─── DELETE ───────────────────────────────────────────────────────────────

  it("deletes a credential and emits a redacted audit log entry", async () => {
    mockSvc.getById.mockResolvedValue(REDACTED_CREDENTIAL);
    mockSvc.delete.mockResolvedValue(undefined);

    const res = await request(createApp())
      .delete("/api/companies/company-1/subscription-credentials/cred-uuid-1");

    expect(res.status).toBe(204);
    expect(mockSvc.delete).toHaveBeenCalledWith("company-1", "user-1", "cred-uuid-1");
    // Audit log must be called; must not contain material
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "subscription_credential.deleted",
        entityId: "cred-uuid-1",
        details: expect.objectContaining({ provider: "claude" }),
      }),
    );
    expect(JSON.stringify(mockLogActivity.mock.calls)).not.toMatch(/material/);
  });

  it("rejects delete for agent actors", async () => {
    const res = await request(createApp(AGENT_ACTOR))
      .delete("/api/companies/company-1/subscription-credentials/cred-uuid-1");

    expect(res.status).toBe(403);
    expect(mockSvc.delete).not.toHaveBeenCalled();
  });
});
