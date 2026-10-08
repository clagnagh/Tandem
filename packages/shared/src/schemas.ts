// Zod schemas for the Phase 1 API. Request bodies use z.strictObject so
// unknown fields are rejected (review checklist).
import { z } from 'zod';
import { LIMITS, TASK_STATUSES, WORKSPACE_ROLES } from './constants.ts';

export const idSchema = z.uuid();
export const taskStatusSchema = z.enum(TASK_STATUSES);
export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES);

const name = (max: number) => z.string().trim().min(1).max(max);

export const workspaceNameSchema = name(LIMITS.workspaceName);
export const projectNameSchema = name(LIMITS.projectName);
export const taskTitleSchema = name(LIMITS.taskTitle);
export const taskDescriptionSchema = z.string().max(LIMITS.taskDescription);
export const emailSchema = z.email().max(LIMITS.email).toLowerCase();
/** A calendar date with no time zone, e.g. "2026-10-31". */
export const dueDateSchema = z.iso.date();

export const createWorkspaceBody = z.strictObject({ name: workspaceNameSchema });
export const renameWorkspaceBody = z.strictObject({ name: workspaceNameSchema });

/** Phase 1 invites always grant the member role; owners are never invited. */
export const createInviteBody = z.strictObject({ email: emailSchema });

export const createProjectBody = z.strictObject({ name: projectNameSchema });
export const renameProjectBody = z.strictObject({ name: projectNameSchema });

export const createTaskBody = z.strictObject({
  title: taskTitleSchema,
  description: taskDescriptionSchema.default(''),
  status: taskStatusSchema.default('todo'),
  assigneeId: z.string().min(1).nullable().default(null),
  dueDate: dueDateSchema.nullable().default(null),
});

export const updateTaskBody = z
  .strictObject({
    title: taskTitleSchema,
    description: taskDescriptionSchema,
    assigneeId: z.string().min(1).nullable(),
    dueDate: dueDateSchema.nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' });

/**
 * Move a task (question 12). The client names its new neighbours in the target
 * column and the server computes the position key:
 * - beforeTaskId: the task that ends up directly above the moved one;
 * - afterTaskId: the task that ends up directly below it.
 * Give only afterTaskId to move to the top, only beforeTaskId to drop below a
 * task, and neither to move to the bottom (or into an empty column).
 */
export const moveTaskBody = z
  .strictObject({
    status: taskStatusSchema,
    beforeTaskId: idSchema.optional(),
    afterTaskId: idSchema.optional(),
  })
  .refine((body) => body.beforeTaskId === undefined || body.beforeTaskId !== body.afterTaskId, {
    message: 'beforeTaskId and afterTaskId must differ',
  });

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  database: z.enum(['up', 'down']),
});

export type CreateWorkspaceBody = z.infer<typeof createWorkspaceBody>;
export type CreateTaskBody = z.infer<typeof createTaskBody>;
export type UpdateTaskBody = z.infer<typeof updateTaskBody>;
export type MoveTaskBody = z.infer<typeof moveTaskBody>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
