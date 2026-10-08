# 11. Board drag and drop

Date: 2026-10-08. Status: Accepted. Spec: phase-1 scope "Drag-and-drop
reordering with optimistic UI updates" and acceptance criterion "Tasks can
be ... moved between columns and reordered by drag and drop; order survives
a reload".

## Options

1. **Native HTML5 drag and drop.** No dependency, but no touch support, no
   keyboard support, and awkward to style.
2. **dnd-kit** (`@dnd-kit/core` and `@dnd-kit/sortable`). Pointer, touch and
   keyboard sensors, screen-reader announcements, sortable lists.
3. **A higher-level kanban component.** Less code, but hides exactly the
   mechanics this project is meant to teach.

## Decision

dnd-kit. Each column is a sortable list and also a drop target, so a card
can be dropped on a card (it takes that card's place) or on a column's empty
space (it goes to the bottom). Keyboard users focus a card, press Space,
move with the arrow keys and press Space again.

The drop is optimistic: `apps/web/lib/board.ts` (pure functions, unit
tested) moves the card on screen at once and works out its new neighbours;
the board then sends `{ status, beforeTaskId, afterTaskId }` to the move
endpoint, and the server computes the position (ADR 0006). If the server
refuses (for example 409 `stale_board` when someone else changed the column),
the board reloads from the server and says so.

## Consequences

- Three small dependencies in the web app.
- Cards do not visibly make room in another column while you drag over it;
  they jump into place on drop. dnd-kit can do this with an `onDragOver`
  handler, which is a reasonable later improvement.
- The Playwright test drags with the mouse in small steps, because dnd-kit
  only starts a drag after the pointer moves 5 px (so clicks still work).
