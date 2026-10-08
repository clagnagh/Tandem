import { createProjectBody, renameProjectBody } from '@tandem/shared';
import type { FastifyInstance } from 'fastify';
import { params, parseId } from '../../http.ts';
import { currentUser } from '../../plugins/session.ts';
import type { ProjectService } from './service.ts';

const PROJECTS = '/api/v1/workspaces/:workspaceId/projects';

export function projectRoutes(projects: ProjectService) {
  return function register(app: FastifyInstance): void {
    app.get(PROJECTS, (request) =>
      projects.list(currentUser(request), parseId(params(request).workspaceId)),
    );

    app.post(PROJECTS, async (request, reply) => {
      const workspaceId = parseId(params(request).workspaceId);
      const body = createProjectBody.parse(request.body);
      const project = await projects.create(currentUser(request), workspaceId, body.name);
      return reply.status(201).send(project);
    });

    app.patch(`${PROJECTS}/:projectId`, async (request) => {
      const p = params(request);
      const body = renameProjectBody.parse(request.body);
      return projects.rename(
        currentUser(request),
        parseId(p.workspaceId),
        parseId(p.projectId),
        body.name,
      );
    });

    app.delete(`${PROJECTS}/:projectId`, async (request, reply) => {
      const p = params(request);
      await projects.remove(currentUser(request), parseId(p.workspaceId), parseId(p.projectId));
      return reply.status(204).send();
    });
  };
}
