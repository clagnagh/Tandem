'use client';

import type { MemberDto, TaskDto } from '@tandem/shared';
import { useState, type SubmitEvent } from 'react';
import { Button } from '../ui.tsx';
import { formText } from '../../lib/form.ts';

export interface TaskChanges {
  title: string;
  description: string;
  assigneeId: string | null;
  dueDate: string | null;
}

export function TaskEditor({
  task,
  members,
  onSave,
  onDelete,
  onClose,
}: {
  task: TaskDto;
  members: MemberDto[];
  onSave: (changes: TaskChanges) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    await onSave({
      title: formText(form, 'title'),
      description: formText(form, 'description'),
      assigneeId: formText(form, 'assigneeId') || null,
      dueDate: formText(form, 'dueDate') || null,
    });
    setBusy(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Edit task"
      className="fixed inset-0 flex items-center justify-center bg-black/30 p-4"
    >
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="flex w-full max-w-md flex-col gap-3 rounded-lg bg-white p-5 shadow-xl"
      >
        <h2 className="text-lg font-semibold">Edit task</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Title</span>
          <input
            name="title"
            defaultValue={task.title}
            required
            maxLength={200}
            className="rounded-md border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Description</span>
          <textarea
            name="description"
            defaultValue={task.description}
            maxLength={10000}
            rows={4}
            className="rounded-md border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Assignee</span>
          <select
            name="assigneeId"
            defaultValue={task.assigneeId ?? ''}
            className="rounded-md border border-zinc-300 px-3 py-2"
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Due date</span>
          <input
            name="dueDate"
            type="date"
            defaultValue={task.dueDate ?? ''}
            className="rounded-md border border-zinc-300 px-3 py-2"
          />
        </label>
        <div className="flex justify-between pt-2">
          <Button type="button" variant="danger" onClick={() => void onDelete()} disabled={busy}>
            Delete
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Save
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
