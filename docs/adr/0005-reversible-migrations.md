# 5. Reversible migrations with a small runner

Date: 2026-10-02. Status: Accepted. Spec: phase-1 question 13, architecture
rule 6.

## Context

Every migration must be reversible and tested against seeded data. Drizzle
Kit generates "up" SQL from the schema but has no down migrations.

## Options

1. **Drizzle's built-in migrator, no rollback.** Breaks the rule.
2. **Switch to a migration tool with rollbacks** (node-pg-migrate, dbmate)
   and stop generating SQL from the schema. Loses Drizzle's schema diffing.
3. **Keep generating with Drizzle Kit, add a hand-written `.down.sql` per
   migration, and apply them with a ~100-line runner of our own.**

## Decision

Option 3. `packages/db/src/migrator.ts` records applied migrations in
`schema_migrations`, runs each migration in a transaction, and holds a
Postgres advisory lock so two deploys cannot migrate at once.

## Consequences

- Writing the down file is a manual step. A test fails if any migration lacks
  one, and CI runs up, seed, down, up on every change.
- We do not use Drizzle's `__drizzle_migrations` table. Use `pnpm db:migrate`,
  never `drizzle-kit migrate` or `drizzle-kit push`.
- A down migration that drops a table destroys its data; that is acceptable
  in development. Production uses expand-and-contract changes (Phase 8).
