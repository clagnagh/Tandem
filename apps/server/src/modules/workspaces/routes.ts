import { createInviteBody, createWorkspaceBody, renameWorkspaceBody } from '@tandem/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NotFoundError } from '../../errors.ts';
import { params, parseId } from '../../http.ts';
import { currentUser } from '../../plugins/session.ts';
import type { WorkspaceService } from './service.ts';

const API = '/api/v1';
const W = `${API}/workspaces/:workspaceId`;

// 32 random bytes, base64url: 43 characters.
const inviteToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export function workspaceRoutes(workspaces: WorkspaceService) {
  return function register(app: FastifyInstance): void {
    app.get(`${API}/workspaces`, (request) => workspaces.list(currentUser(request)));

    app.post(`${API}/workspaces`, async (request, reply) => {
      const body = createWorkspaceBody.parse(request.body);
      const ws = await workspaces.create(currentUser(request), body.name);
      return reply.status(201).send(ws);
    });

    app.patch(W, async (request) => {
      const workspaceId = parseId(params(request).workspaceId);
      const body = renameWorkspaceBody.parse(request.body);
      return workspaces.rename(currentUser(request), workspaceId, body.name);
    });

    app.delete(W, async (request, reply) => {
      const workspaceId = parseId(params(request).workspaceId);
      await workspaces.remove(currentUser(request), workspaceId);
      return reply.status(204).send();
    });

    app.post(`${W}/invites`, async (request, reply) => {
      const workspaceId = parseId(params(request).workspaceId);
      const body = createInviteBody.parse(request.body);
      const invite = await workspaces.invite(currentUser(request), workspaceId, body.email);
      return reply.status(201).send(invite);
    });

    app.post(`${API}/invites/:token/accept`, async (request) => {
      const token = inviteToken.safeParse(params(request).token);
      if (!token.success) throw new NotFoundError('Invite not found', 'invite_not_found');
      return workspaces.acceptInvite(currentUser(request), token.data);
    });
  };
}
