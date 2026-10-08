'use client';

// The kanban board. Drag and drop uses dnd-kit (docs/adr/0011). A drop
// changes the board at once (optimistic update), then asks the API to move
// the task between its new neighbours; the server computes the position. If
// the API refuses, the board is reloaded from the server.
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { TASK_STATUSES, type MemberDto, type TaskDto, type TaskStatus } from '@tandem/shared';
import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import { api, ApiError, errorMessage } from '../../lib/api.ts';
import {
  findTask,
  moveTask,
  removeTask,
  replaceTask,
  toColumns,
  type Columns,
} from '../../lib/board.ts';
import { ErrorText } from '../ui.tsx';
import { TaskCard, TaskCardOverlay } from './task-card.tsx';
import { TaskEditor, type TaskChanges } from './task-editor.tsx';
import { formText } from '../../lib/form.ts';

const LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};
const COLUMN_PREFIX = 'column:';

/** Prefer the card under the pointer; fall back to the column (for empty space). */
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const pool = hits.length > 0 ? hits : rectIntersection(args);
  const card = pool.find((c) => !String(c.id).startsWith(COLUMN_PREFIX));
  return card ? [card] : pool.slice(0, 1);
};

function Column({
  status,
  tasks,
  members,
  onEdit,
  onAdd,
}: {
  status: TaskStatus;
  tasks: TaskDto[];
  members: MemberDto[];
  onEdit: (task: TaskDto) => void;
  onAdd: (status: TaskStatus, title: string) => Promise<void>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COLUMN_PREFIX}${status}` });

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await onAdd(status, formText(form, 'title'));
    form.reset();
  }

  return (
    <section
      ref={setNodeRef}
      data-testid={`column-${status}`}
      aria-label={LABELS[status]}
      className={`flex min-h-64 flex-col gap-3 rounded-lg p-3 ${isOver ? 'bg-zinc-200' : 'bg-zinc-100'}`}
    >
      <h2 className="text-sm font-semibold text-zinc-700">
        {LABELS[status]} <span className="font-normal text-zinc-500">{tasks.length}</span>
      </h2>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-1 flex-col gap-2">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} members={members} onEdit={onEdit} />
          ))}
        </ul>
      </SortableContext>
      <form onSubmit={(e) => void onSubmit(e)} className="flex gap-1">
        <input
          name="title"
          required
          maxLength={200}
          placeholder="Add a task"
          aria-label={`New task in ${LABELS[status]}`}
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
        />
        <button type="submit" className="rounded-md bg-zinc-900 px-2 py-1 text-sm text-white">
          Add
        </button>
      </form>
    </section>
  );
}

export function Board({
  workspaceId,
  projectId,
  members,
}: {
  workspaceId: string;
  projectId: string;
  members: MemberDto[];
}) {
  const [columns, setColumns] = useState<Columns>();
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string>();
  const [editing, setEditing] = useState<TaskDto>();

  const sensors = useSensors(
    // A small distance before a drag starts, so clicks still work.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reload = useCallback(async () => {
    try {
      setColumns(toColumns(await api.listTasks(workspaceId, projectId)));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [workspaceId, projectId]);

  useEffect(() => {
    let cancelled = false;
    api.listTasks(workspaceId, projectId).then(
      (tasks) => {
        if (!cancelled) setColumns(toColumns(tasks));
      },
      (err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [workspaceId, projectId]);

  if (!columns) return <ErrorText>{error}</ErrorText>;
  const board = columns;
  const activeTask = activeId
    ? TASK_STATUSES.flatMap((s) => board[s]).find((t) => t.id === activeId)
    : undefined;

  async function onDragEnd(event: DragEndEvent) {
    setActiveId(undefined);
    const taskId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : undefined;
    if (!overId || overId === taskId) return;

    let toStatus: TaskStatus;
    let toIndex: number;
    if (overId.startsWith(COLUMN_PREFIX)) {
      // Dropped on a column's empty space: to the bottom.
      toStatus = overId.slice(COLUMN_PREFIX.length) as TaskStatus;
      toIndex = board[toStatus].filter((t) => t.id !== taskId).length;
    } else {
      // Dropped on a card: take its place (it moves down, or up when the
      // dragged card came from above it in the same column).
      const over = findTask(board, overId);
      if (!over) return;
      toStatus = over.status;
      toIndex = over.index;
    }

    const result = moveTask(board, taskId, toStatus, toIndex);
    if (!result) return;
    setColumns(result.columns);
    setError('');
    try {
      const saved = await api.moveTask(workspaceId, taskId, result.request);
      setColumns((current) => current && replaceTask(current, saved));
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'stale_board'
          ? 'Someone else changed this board, so it was reloaded. Try the move again.'
          : errorMessage(err),
      );
      await reload();
    }
  }

  async function onAdd(status: TaskStatus, title: string) {
    setError('');
    try {
      const task = await api.createTask(workspaceId, projectId, { title, status });
      setColumns((current) => current && replaceTask(current, task));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function onSave(task: TaskDto, changes: TaskChanges) {
    setError('');
    try {
      const saved = await api.updateTask(workspaceId, task.id, changes);
      setColumns((current) => current && replaceTask(current, saved));
      setEditing(undefined);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function onDelete(task: TaskDto) {
    setError('');
    try {
      await api.deleteTask(workspaceId, task.id);
      setColumns((current) => current && removeTask(current, task.id));
      setEditing(undefined);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ErrorText>{error}</ErrorText>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={(e: DragStartEvent) => {
          setActiveId(String(e.active.id));
        }}
        onDragCancel={() => {
          setActiveId(undefined);
        }}
        onDragEnd={(e) => void onDragEnd(e)}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {TASK_STATUSES.map((status) => (
            <Column
              key={status}
              status={status}
              tasks={board[status]}
              members={members}
              onEdit={setEditing}
              onAdd={onAdd}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask && <TaskCardOverlay task={activeTask} members={members} />}
        </DragOverlay>
      </DndContext>
      {editing && (
        <TaskEditor
          task={editing}
          members={members}
          onSave={(changes) => onSave(editing, changes)}
          onDelete={() => onDelete(editing)}
          onClose={() => {
            setEditing(undefined);
          }}
        />
      )}
    </div>
  );
}
