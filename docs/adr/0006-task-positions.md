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
