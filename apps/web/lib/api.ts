// A small typed client for the Tandem API. Requests go to /api/* on this
// origin; Next.js forwards them to the Fastify server (docs/adr/0002), and
// the session cookie travels with them automatically.
import type {
  AcceptInviteDto,
  ApiErrorBody,
  InviteDto,
  MemberDto,
  ProjectDto,
  TaskDto,
  TaskStatus,
  WorkspaceDto,
} from '@tandem/shared';
import type { MoveRequest } from './board.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    // Our API errors are { error: { code, message } }; Better Auth's are { code, message }.
    const err =
      (data as Partial<ApiErrorBody> | null)?.error ??
      (data as { code?: string; message?: string } | null);
    throw new ApiError(
      res.status,
      err?.code ?? 'error',
      err?.message ?? `Request failed (${res.status})`,
    );
  }
  return data as T;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export const api = {
  // Auth (Better Auth, under /api/v1/auth)
  getSession: () => request<{ user: SessionUser } | null>('GET', '/auth/get-session'),
  signUp: (body: { name: string; email: string; password: string }) =>
    request('POST', '/auth/sign-up/email', { ...body, callbackURL: '/sign-in?verified=1' }),
  signIn: (body: { email: string; password: string }) =>
    request('POST', '/auth/sign-in/email', body),
  signInWithGitHub: () =>
    request<{ url: string }>('POST', '/auth/sign-in/social', {
      provider: 'github',
      callbackURL: '/workspaces',
    }),
  signOut: () => request('POST', '/auth/sign-out', {}),
  requestPasswordReset: (email: string) =>
    request('POST', '/auth/request-password-reset', {
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    }),
  resetPassword: (token: string, newPassword: string) =>
    request('POST', '/auth/reset-password', { token, newPassword }),

  // Workspaces
  listWorkspaces: () => request<WorkspaceDto[]>('GET', '/workspaces'),
  createWorkspace: (name: string) => request<WorkspaceDto>('POST', '/workspaces', { name }),
  listMembers: (workspaceId: string) =>
    request<MemberDto[]>('GET', `/workspaces/${workspaceId}/members`),
  invite: (workspaceId: string, email: string) =>
    request<InviteDto>('POST', `/workspaces/${workspaceId}/invites`, { email }),
  acceptInvite: (token: string) => request<AcceptInviteDto>('POST', `/invites/${token}/accept`),

  // Projects
  listProjects: (workspaceId: string) =>
    request<ProjectDto[]>('GET', `/workspaces/${workspaceId}/projects`),
  createProject: (workspaceId: string, name: string) =>
    request<ProjectDto>('POST', `/workspaces/${workspaceId}/projects`, { name }),

  // Tasks
  listTasks: (workspaceId: string, projectId: string) =>
    request<TaskDto[]>('GET', `/workspaces/${workspaceId}/projects/${projectId}/tasks`),
  createTask: (
    workspaceId: string,
    projectId: string,
    body: { title: string; status: TaskStatus },
  ) => request<TaskDto>('POST', `/workspaces/${workspaceId}/projects/${projectId}/tasks`, body),
  updateTask: (
    workspaceId: string,
    taskId: string,
    body: Partial<Pick<TaskDto, 'title' | 'description' | 'assigneeId' | 'dueDate'>>,
  ) => request<TaskDto>('PATCH', `/workspaces/${workspaceId}/tasks/${taskId}`, body),
  deleteTask: (workspaceId: string, taskId: string) =>
    request<null>('DELETE', `/workspaces/${workspaceId}/tasks/${taskId}`),
  moveTask: (workspaceId: string, taskId: string, body: MoveRequest) =>
    request<TaskDto>('POST', `/workspaces/${workspaceId}/tasks/${taskId}/move`, body),
};

/** A message to show the user for any error. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Too many attempts. Wait a minute and try again.';
    return err.message;
  }
  return 'Something went wrong. Check your connection and try again.';
}
