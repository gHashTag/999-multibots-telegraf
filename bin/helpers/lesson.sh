#!/usr/bin/env bash
# A LESSON GOES INTO A SKILL WHILE IT IS STILL TRUE.
#
# Experience that stays in a session dies with it. This appends a dated
# lesson to a named skill, so writing one down costs a line rather than a
# file hunt -- and refuses a skill that does not exist, because a lesson
# written into a new file nobody reads is a lesson lost.
set -euo pipefail
ROOT="${1:?usage: tri lesson <skill> <text…>}"
SKILL="${2:?usage: tri lesson <skill> <text…>}"
shift 2
TEXT="$*"
[ -n "$TEXT" ] || { echo "usage: tri lesson <skill> <text…>" >&2; exit 1; }
FILE="$ROOT/.claude/skills/$SKILL/SKILL.md"
if [ ! -f "$FILE" ]; then
  echo "нет такого скила: $SKILL" >&2
  echo "есть:" >&2
  ls "$ROOT/.claude/skills" | sed 's/^/  /' >&2
  exit 1
fi
{
  printf '\n- **%s.** %s\n' "$(date +%d.%m.%Y)" "$TEXT"
} >> "$FILE"
echo "записано в $SKILL: $TEXT"
