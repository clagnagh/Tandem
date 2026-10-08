import { createTaskBody, moveTaskBody, updateTaskBody } from '@tandem/shared';
import type { FastifyInstance } from 'fastify';
import { params, parseId } from '../../http.ts';
import { currentUser } from '../../plugins/session.ts';
import type { TaskService } from './service.ts';

const W = '/api/v1/workspaces/:workspaceId';

export function taskRoutes(tasks: TaskService) {
  return function register(app: FastifyInstance): void {
    app.get(`${W}/projects/:projectId/tasks`, async (request) => {
      const p = params(request);
      return tasks.list(currentUser(request), parseId(p.workspaceId), parseId(p.projectId));
    });

    app.post(`${W}/projects/:projectId/tasks`, async (request, reply) => {
      const p = params(request);
      const body = createTaskBody.parse(request.body);
      const task = await tasks.create(
        currentUser(request),
        parseId(p.workspaceId),
        parseId(p.projectId),
        body,
      );
      return reply.status(201).send(task);
    });

    app.patch(`${W}/tasks/:taskId`, async (request) => {
      const p = params(request);
      const body = updateTaskBody.parse(request.body);
      return tasks.update(currentUser(request), parseId(p.workspaceId), parseId(p.taskId), body);
    });

    app.delete(`${W}/tasks/:taskId`, async (request, reply) => {
      const p = params(request);
      await tasks.remove(currentUser(request), parseId(p.workspaceId), parseId(p.taskId));
      return reply.status(204).send();
    });

    app.post(`${W}/tasks/:taskId/move`, async (request) => {
      const p = params(request);
      const body = moveTaskBody.parse(request.body);
      return tasks.move(currentUser(request), parseId(p.workspaceId), parseId(p.taskId), body);
    });
  };
}
