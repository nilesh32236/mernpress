import type { AuthService, PrivacyPolicyService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const setPolicySchema = z.object({ pageId: z.string().uuid().nullable() }).strict();

interface PrivacyPolicyRouteOptions {
  env: Env;
  auth: AuthService;
  privacyPolicy: PrivacyPolicyService;
}

/**
 * Settings → Privacy actions: create the suggested policy page, or select an
 * existing page ("Use This Page"). Administrators only, matching the settings
 * capability.
 */
export function registerPrivacyPolicyRoutes(
  app: FastifyInstance,
  options: PrivacyPolicyRouteOptions,
): void {
  const { env, auth, privacyPolicy } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.post('/api/admin/privacy/policy-page', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return await privacyPolicy.createPolicyPage(ctx.principal);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.put('/api/admin/privacy/policy-page', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = setPolicySchema.parse(request.body);
      return await privacyPolicy.setPolicyPage(ctx.principal, body.pageId);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}
