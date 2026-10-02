-- Reverses 0000_init.sql. Tables are dropped children first; dropping a
-- table also drops its indexes and constraints.
DROP TABLE "tasks";
DROP TABLE "projects";
DROP TABLE "invites";
DROP TABLE "workspace_members";
DROP TABLE "workspaces";
DROP TABLE "verifications";
DROP TABLE "sessions";
DROP TABLE "accounts";
DROP TABLE "users";
DROP TYPE "public"."task_status";
DROP TYPE "public"."workspace_role";
