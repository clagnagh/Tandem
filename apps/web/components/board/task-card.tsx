'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { MemberDto, TaskDto } from '@tandem/shared';

interface CardProps {
  task: TaskDto;
  members: MemberDto[];
  onEdit?: (task: TaskDto) => void;
  overlay?: boolean;
}

function CardBody({ task, members, onEdit }: CardProps) {
  const assignee = members.find((m) => m.userId === task.assigneeId);
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{task.title}</span>
        <span className="text-xs text-zinc-500">
          {assignee ? assignee.name : 'Unassigned'}
          {task.dueDate && ` · due ${task.dueDate}`}
        </span>
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={() => {
            onEdit(task);
          }}
          // Keep a click on "Edit" from starting a drag.
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          className="text-xs text-zinc-500 underline"
          aria-label={`Edit ${task.title}`}
        >
          Edit
        </button>
      )}
    </div>
  );
}

/** A task you can drag. Keyboard: focus it, Space to pick up, arrows to move, Space to drop. */
export function TaskCard(props: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.task.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`cursor-grab rounded-md border border-zinc-200 bg-white p-3 shadow-sm ${isDragging ? 'opacity-40' : ''}`}
      data-testid="task-card"
      {...attributes}
      {...listeners}
    >
      <CardBody {...props} />
    </li>
  );
}

/** The copy that follows the pointer while dragging. */
export function TaskCardOverlay(props: CardProps) {
  return (
    <div className="cursor-grabbing rounded-md border border-zinc-300 bg-white p-3 shadow-lg">
      <CardBody {...props} />
    </div>
  );
}
