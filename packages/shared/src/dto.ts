// Response shapes of the /api/v1 endpoints, as JSON (dates are ISO strings).
// The web app types its API client with these.
import type { TaskStatus, WorkspaceRole } from './constants.ts';

export interface WorkspaceDto {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
}

export interface MemberDto {
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
}

export interface InviteDto {
  id: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
}

export interface AcceptInviteDto {
  workspaceId: string;
  role: WorkspaceRole;
}

export interface ProjectDto {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDto {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  assigneeId: string | null;
  /** A calendar date, e.g. "2026-10-31". */
  dueDate: string | null;
  position: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Every error response has this shape (apps/server/src/plugins/error-handler.ts). */
export interface ApiErrorBody {
  error: { code: string; message: string; requestId?: string };
}
