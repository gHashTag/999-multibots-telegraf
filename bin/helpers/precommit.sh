#!/bin/bash
# tri precommit [gate ...]
#
# RUN THE COMMIT'S GATES WITHOUT COMMITTING.
#
# CRM mobile loop, tick 2 (01.10.2026): `npx tsc --noEmit -p .` in the player
# said clean, the commit then failed on player-types -- the player's
# tsconfig.json is a solution file with references and checks NOTHING; the
# gate runs tsconfig.app.json. Forty seconds per failed commit, and a message
# to write again. This runs the same lefthook gates, with the same stripped
# environment the loop commits with (a leaked LOG_LEVEL fails the winston
# tests; see skill phone-shot, "Gates in a worktree").
#
#   tri precommit                    every pre-commit gate
#   tri precommit player-types lint  only these
#
# Exit code is lefthook's.
set -uo pipefail
ROOT="${1:?root}"; shift
ARGS=()
for g in "$@"; do ARGS+=(--command "$g"); done
cd "$ROOT" || exit 2
# env's -u flags must come before the first NAME=value, or env runs "-u".
exec env -u LOG_LEVEL -u log_level -u OPENAI_API_KEY -u OPENAI_API_BASE \
  -u OPENAI_BASE_URL -u WHISPER_API_KEY CHECKS_LOCAL=1 \
  npx lefthook run pre-commit --force "${ARGS[@]}"
