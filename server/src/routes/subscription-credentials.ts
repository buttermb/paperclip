import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import {
  subscriptionCredentialTestStatusSchema,
  upsertSubscriptionCredentialSchema,
} from "@paperclipai/shared";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { logActivity, subscriptionCredentialService } from "../services/index.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

// BYO subscription credentials are strictly per-user: every route requires a
// board user context and scopes all reads/mutations to that user within the
// company. Agents cannot manage another user's subscription seats.
function requireBoardUserId(req: Request, res: Response): string | null {
  assertBoard(req);
  if (!req.actor.userId) {
    res.status(403).json({ error: "Board user context required" });
    return null;
  }
  return req.actor.userId;
}

const recordTestResultSchema = z.object({
  testStatus: subscriptionCredentialTestStatusSchema,
});

export function subscriptionCredentialRoutes(db: Db) {
  const router = Router();
  const svc = subscriptionCredentialService(db);

  // List the current user's credential records (redacted).
  router.get("/companies/:companyId/subscription-credentials", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const userId = requireBoardUserId(req, res);
    if (!userId) return;
    res.json(await svc.list(companyId, userId));
  });

  // Read a single credential record (redacted).
  router.get(
    "/companies/:companyId/subscription-credentials/:credentialId",
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const userId = requireBoardUserId(req, res);
      if (!userId) return;
      res.json(await svc.getById(companyId, userId, req.params.credentialId as string));
    },
  );

  // Link or update a credential (upsert keyed by company + user + provider).
  router.put(
    "/companies/:companyId/subscription-credentials",
    validate(upsertSubscriptionCredentialSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const userId = requireBoardUserId(req, res);
      if (!userId) return;

      const body = req.body as z.infer<typeof upsertSubscriptionCredentialSchema>;
      const result = await svc.upsert({
        companyId,
        userId,
        provider: body.provider,
        credentialKind: body.credentialKind,
        material: body.material,
        status: body.status,
      });

      const actor = getActorInfo(req);
      // Audit only redacted, non-sensitive fields; never the credential material.
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "subscription_credential.linked",
        entityType: "subscription_credential",
        entityId: result.id,
        details: {
          userId,
          provider: result.provider,
          credentialKind: result.credentialKind,
          status: result.status,
        },
      });
      res.status(200).json(result);
    },
  );

  // Record the outcome of a downstream readiness/validity test.
  router.post(
    "/companies/:companyId/subscription-credentials/:credentialId/test-result",
    validate(recordTestResultSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const userId = requireBoardUserId(req, res);
      if (!userId) return;

      const credentialId = req.params.credentialId as string;
      const body = req.body as z.infer<typeof recordTestResultSchema>;
      const result = await svc.recordTestResult(companyId, userId, credentialId, body.testStatus);

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "subscription_credential.tested",
        entityType: "subscription_credential",
        entityId: result.id,
        details: {
          userId,
          provider: result.provider,
          testStatus: result.testStatus,
        },
      });
      res.json(result);
    },
  );

  // Delete a credential record.
  router.delete(
    "/companies/:companyId/subscription-credentials/:credentialId",
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const userId = requireBoardUserId(req, res);
      if (!userId) return;

      const credentialId = req.params.credentialId as string;
      // Resolve first so we can attach redacted provider info to the audit log.
      const existing = await svc.getById(companyId, userId, credentialId);
      await svc.delete(companyId, userId, credentialId);

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "subscription_credential.deleted",
        entityType: "subscription_credential",
        entityId: credentialId,
        details: {
          userId,
          provider: existing.provider,
          credentialKind: existing.credentialKind,
        },
      });
      res.status(204).end();
    },
  );

  return router;
}
