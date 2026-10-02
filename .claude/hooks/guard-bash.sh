#!/usr/bin/env bash
# PreToolUse hook: block destructive shell commands so Claude has to ask the
# user first (CLAUDE.md: "Never run destructive commands without asking").
set -uo pipefail

command=$(jq -r '.tool_input.command // empty')

patterns=(
  'rm[[:space:]]+-[a-zA-Z]*r[a-zA-Z]*f|rm[[:space:]]+-[a-zA-Z]*f[a-zA-Z]*r'
  'git[[:space:]]+reset[[:space:]]+--hard'
  'git[[:space:]]+push[[:space:]].*(--force|-f([[:space:]]|$))'
  'git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*f'
  'drop[[:space:]]+(table|database|schema)'
  'truncate[[:space:]]+'
  'docker[[:space:]]+compose[[:space:]]+down[[:space:]].*-v'
  'db:rollback'
)

for pattern in "${patterns[@]}"; do
  if echo "$command" | grep -Eiq -- "$pattern"; then
    echo "Blocked: this command looks destructive ($pattern). Ask the user before running it." >&2
    exit 2
  fi
done
exit 0
