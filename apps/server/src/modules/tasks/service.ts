// Task rules. Positions are fractional-index keys computed here, never by the
// client, while the project row is locked (docs/adr/0006).
import type { Database, Executor } from '@tandem/db';
import type { CreateTaskBody, MoveTaskBody, UpdateTaskBody } from '@tandem/shared';
import { generateKeyBetween } from 'fractional-indexing';
import { BadRequestError, ConflictError, NotFoundError } from '../../errors.ts';
import type { SessionUser } from '../../plugins/session.ts';
import type { ProjectService } from '../projects/service.ts';
import type { WorkspaceService } from '../workspaces/service.ts';
import * as repo from './repository.ts';

/** A key strictly between two others; a stale or tied pair is a conflict. */
function keyBetween(before: string | null, after: string | null): string {
  // fractional-indexing 4 quietly swaps a reversed pair, which would put the
  // task somewhere the user did not drop it. Keys are ASCII, so < compares
  // them byte by byte, like the column's "C" collation.
  if (before !== null && after !== null && !(before < after)) {
    throw new ConflictError('The board changed; reload and try again', 'stale_board');
  }
  try {
    return generateKeyBetween(before, after);
  } catch {
    throw new ConflictError('The board changed; reload and try again', 'stale_board');
  }
}

export function createTaskService(deps: {
  db: Database;
  workspaces: WorkspaceService;
  projects: ProjectService;
}) {
  const { db, workspaces, projects } = deps;

  async function requireTask(workspaceId: string, taskId: string, executor: Executor = db) {
    const task = await repo.find(executor, workspaceId, taskId);
    if (!task) throw new NotFoundError();
    return task;
  }

  /** Assignees must be members of the workspace (question 10). */
  async function checkAssignee(workspaceId: string, assigneeId: string | null | undefined) {
    if (assigneeId && !(await workspaces.isMember(workspaceId, assigneeId))) {
      throw new BadRequestError(
        'The assignee must be a member of this workspace',
        'invalid_assignee',
      );
    }
  }

  return {
    async list(user: SessionUser, workspaceId: string, projectId: string) {
      await workspaces.requireMember(user.id, workspaceId);
      await projects.requireProject(workspaceId, projectId);
      return repo.listForProject(db, workspaceId, projectId);
    },

    async create(user: SessionUser, workspaceId: string, projectId: string, body: CreateTaskBody) {
      await workspaces.requireMember(user.id, workspaceId);
      await checkAssignee(workspaceId, body.assigneeId);
      return db.transaction(async (tx) => {
        await projects.lockForPositionChange(tx, workspaceId, projectId);
        const last = await repo.lastPosition(tx, { workspaceId, projectId, status: body.status });
        return repo.insert(tx, {
          workspaceId,
          projectId,
          ...body,
          position: keyBetween(last, null),
          createdBy: user.id,
        });
      });
    },

    async update(user: SessionUser, workspaceId: string, taskId: string, body: UpdateTaskBody) {
      await workspaces.requireMember(user.id, workspaceId);
      await requireTask(workspaceId, taskId);
      await checkAssignee(workspaceId, body.assigneeId);
      const task = await repo.update(db, workspaceId, taskId, body);
      if (!task) throw new NotFoundError();
      return task;
    },

    async remove(user: SessionUser, workspaceId: string, taskId: string) {
      await workspaces.requireMember(user.id, workspaceId);
      if (!(await repo.remove(db, workspaceId, taskId))) throw new NotFoundError();
    },

    /**
     * Moves a task to `status`, between `beforeTaskId` (the task that will be
     * directly above it) and `afterTaskId` (directly below). With only one
     * neighbour the other side is looked up; with none it goes to the bottom.
     */
    async move(user: SessionUser, workspaceId: string, taskId: string, body: MoveTaskBody) {
      await workspaces.requireMember(user.id, workspaceId);
      return db.transaction(async (tx) => {
        const task = await requireTask(workspaceId, taskId, tx);
        await projects.lockForPositionChange(tx, workspaceId, task.projectId);

        const column = {
          workspaceId,
          projectId: task.projectId,
          status: body.status,
          excludeTaskId: task.id,
        };
        const neighbour = async (id: string | undefined) => {
          if (id === undefined) return undefined;
          // Neighbour ids come from the client: they must be in this workspace
          // (else 404, like any other id) and in the target column.
          const other = await requireTask(workspaceId, id, tx);
          if (
            other.id === task.id ||
            other.projectId !== task.projectId ||
            other.status !== body.status
          ) {
            throw new BadRequestError(
              'Neighbours must be other tasks in the target column',
              'bad_neighbour',
            );
          }
          return other.position;
        };
        const before = await neighbour(body.beforeTaskId);
        const after = await neighbour(body.afterTaskId);

        let position: string;
        if (before !== undefined && after !== undefined) {
          position = keyBetween(before, after);
        } else if (before !== undefined) {
          position = keyBetween(before, await repo.positionAfter(tx, column, before));
        } else if (after !== undefined) {
          position = keyBetween(await repo.positionBefore(tx, column, after), after);
        } else {
          position = keyBetween(await repo.lastPosition(tx, column), null);
        }

        const moved = await repo.update(tx, workspaceId, taskId, { status: body.status, position });
        if (!moved) throw new NotFoundError();
        return moved;
      });
    },
  };
}

export type TaskService = ReturnType<typeof createTaskService>;
