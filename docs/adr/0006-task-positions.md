# 6. Server-computed fractional positions

Date: 2026-10-02. Status: Accepted. Spec: phase-1 question 12, acceptance
criterion "Two rapid moves of the same task never corrupt the order".

## Context

A task's place in its column is stored in `position`. Moving one task should
update one row.

## Options

1. **Integer positions.** Moving a task renumbers every task after it: many
   writes, and two concurrent moves interleave badly.
2. **Fractional index keys computed by the client.** One write, but two
   clients can compute the same key between the same neighbours, creating a
   tie whose order is undefined.
3. **Fractional index keys computed by the server.** The client sends the
   target column and the ids of its new neighbours. The server locks those
   rows, computes a key between them, and writes one row, all in one
   transaction.

## Decision

Option 3, using the `fractional-indexing` library (string keys such as
`a0`, `a0V`, `a1`). Boards sort by `(position, id)`, so even an unexpected
tie has a stable order and cannot reorder other tasks.

## Consequences

- The `position` column uses `COLLATE "C"`. Keys must compare byte by byte;
  a locale collation such as `en_US` would sort `a0` before `Z` and scramble
  the board. A test checks the column's collation.
- Keys grow slightly longer each time a task is placed between the same two
  neighbours. That is harmless at our scale; a rebalancing job is a possible
  later exercise.
- Learning exercise: compare integer and fractional positions under
  concurrent moves (spec exercise 3).

## How it was built (Phase 1 step 5)

- Instead of locking the two neighbour rows, every change to positions in a
  project (creating or moving a task) first locks the **project row**
  (`SELECT ... FOR UPDATE`). Changes within one project run one at a time;
  different projects do not block each other. This also covers creating
  tasks, where there is no neighbour to lock: without it, tasks created at
  the same moment read the same "last position" and got identical keys (a
  test proves the lock is needed: it fails every time without it).
- `fractional-indexing` 4 quietly swaps a reversed pair of keys instead of
  refusing it. The service checks the order itself and answers 409
  `stale_board`, so a client with an out-of-date board reloads instead of
  dropping the task somewhere unexpected.
- Neighbour ids from the client are checked like any other id: another
  workspace's task is a 404, a task in a different column is a 400.
