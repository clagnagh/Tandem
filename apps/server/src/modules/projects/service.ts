import type { Database, Executor } from '@tandem/db';
import { NotFoundError } from '../../errors.ts';
import type { SessionUser } from '../../plugins/session.ts';
import type { WorkspaceService } from '../workspaces/service.ts';
import * as repo from './repository.ts';

// Phase 1: any member may manage projects (docs/spec/phase-1.md, question 9).
export function createProjectService(deps: { db: Database; workspaces: WorkspaceService }) {
  const { db, workspaces } = deps;

  async function requireProject(workspaceId: string, projectId: string, executor: Executor = db) {
    const project = await repo.find(executor, workspaceId, projectId);
    if (!project) throw new NotFoundError();
    return project;
  }

  return {
    requireProject,

    /** Locks a project for a position change; 404 if it is not in the workspace. */
    async lockForPositionChange(tx: Executor, workspaceId: string, projectId: string) {
      if (!(await repo.lock(tx, workspaceId, projectId))) throw new NotFoundError();
    },

    async list(user: SessionUser, workspaceId: string) {
      await workspaces.requireMember(user.id, workspaceId);
      return repo.list(db, workspaceId);
    },

    async create(user: SessionUser, workspaceId: string, name: string) {
      await workspaces.requireMember(user.id, workspaceId);
      return repo.insert(db, { workspaceId, name, createdBy: user.id });
    },

    async rename(user: SessionUser, workspaceId: string, projectId: string, name: string) {
      await workspaces.requireMember(user.id, workspaceId);
      const project = await repo.rename(db, workspaceId, projectId, name);
      if (!project) throw new NotFoundError();
      return project;
    },

    async remove(user: SessionUser, workspaceId: string, projectId: string) {
      await workspaces.requireMember(user.id, workspaceId);
      if (!(await repo.remove(db, workspaceId, projectId))) throw new NotFoundError();
    },
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;
