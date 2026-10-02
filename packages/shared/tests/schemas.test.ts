import { describe, expect, it } from 'vitest';
import { createTaskBody, createWorkspaceBody, moveTaskBody, updateTaskBody } from '../src/index.ts';

describe('request schemas', () => {
  it('rejects unknown fields', () => {
    const result = createWorkspaceBody.safeParse({ name: 'Acme', ownerId: 'someone-else' });
    expect(result.success).toBe(false);
  });

  it('trims names and rejects blank ones', () => {
    expect(createWorkspaceBody.parse({ name: '  Acme  ' })).toEqual({ name: 'Acme' });
    expect(createWorkspaceBody.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('fills task defaults', () => {
    expect(createTaskBody.parse({ title: 'Write spec' })).toEqual({
      title: 'Write spec',
      description: '',
      status: 'todo',
      assigneeId: null,
      dueDate: null,
    });
  });

  it('rejects a title over 200 characters', () => {
    expect(createTaskBody.safeParse({ title: 'x'.repeat(201) }).success).toBe(false);
  });

  it('rejects an empty update', () => {
    expect(updateTaskBody.safeParse({}).success).toBe(false);
  });

  it('rejects a move that names the same task on both sides', () => {
    const id = '0b6a7a0e-6d0e-4a52-9a43-2f8f0d4f6c11';
    expect(
      moveTaskBody.safeParse({ status: 'done', beforeTaskId: id, afterTaskId: id }).success,
    ).toBe(false);
    expect(moveTaskBody.safeParse({ status: 'done' }).success).toBe(true);
  });
});
