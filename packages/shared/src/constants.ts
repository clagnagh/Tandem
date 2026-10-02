// Values shared by web, server and (later) worker. Decisions behind them are
// in docs/spec/phase-1.md, "Open questions".

export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const WORKSPACE_ROLES = ['owner', 'member'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Field length limits (question 11). The database enforces them too. */
export const LIMITS = {
  workspaceName: 80,
  projectName: 80,
  taskTitle: 200,
  taskDescription: 10_000,
  email: 254,
} as const;

/** Invite links expire after this many days and work once. */
export const INVITE_TTL_DAYS = 7;

/** Login rate limit (question 5): two counters, one per IP and one per email. */
export const LOGIN_RATE_LIMIT = { maxAttempts: 5, windowSeconds: 60 } as const;
