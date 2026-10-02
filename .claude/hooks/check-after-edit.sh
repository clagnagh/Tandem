#!/usr/bin/env bash
# PostToolUse hook: after Claude edits a TypeScript file, typecheck the
# affected package(s) and lint the file. Exit code 2 sends the errors back to
# Claude so it fixes them before moving on.
set -uo pipefail

file=$(jq -r '.tool_input.file_path // empty')
case "$file" in
  *.ts | *.tsx) ;;
  *) exit 0 ;;
esac

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
rel="${file#"$root"/}"
cd "$root" || exit 0

# A change in packages/ can break any app that imports it, so check them all.
case "$rel" in
  apps/*) typecheck=(pnpm -s --filter "./apps/$(echo "$rel" | cut -d/ -f2)" typecheck) ;;
  *) typecheck=(pnpm -s typecheck) ;;
esac

output=$({ "${typecheck[@]}" 2>&1 && pnpm -s exec eslint --max-warnings 0 "$rel" 2>&1; })
status=$?
if [ $status -ne 0 ]; then
  echo "Typecheck or lint failed after editing $rel:" >&2
  echo "$output" | tail -40 >&2
  exit 2
fi
exit 0
