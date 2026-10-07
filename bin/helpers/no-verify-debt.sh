#!/bin/bash
# tri no-verify-debt [base] -- the gates a --no-verify commit skipped, run now.
#
# 2026-10-02 night loop: every commit went in with --no-verify (the root
# typecheck cannot run in a worktree without root node_modules), and three
# ticks in a row reported "the cyrillic guard printed something odd" -- it was
# zsh, not the guard. This runs the cheap gates over the whole branch diff
# with bash, read-only (prettier --check, eslint without --fix), and exits
# non-zero if any failed, so the debt is measured instead of remembered.
set -u
ROOT="${1:?repo root required}"; shift
cd "$ROOT" || exit 1
BASE="${1:-origin/main}"
FILES=$(git diff --name-only --diff-filter=ACMR "$BASE"...HEAD)
CODE=$(printf '%s\n' "$FILES" | grep -E '\.(ts|tsx|js|mjs|cjs)$')
fail=0
run() { local name=$1; shift; if "$@" >/tmp/nvd.$$ 2>&1; then echo "✔ $name"; else echo "✘ $name"; tail -8 /tmp/nvd.$$; fail=1; fi; }
run no-cyrillic bash -c "node scripts/no-cyrillic-guard.cjs range $BASE..HEAD"
run secrets ./scripts/security-token-guard.sh base "$BASE"
[ -n "$CODE" ] && run prettier npx prettier --check $CODE
[ -n "$CODE" ] && run eslint npx eslint --quiet $CODE
rm -f /tmp/nvd.$$
[ $fail = 0 ] && echo "долг --no-verify: 0" || echo "долг --no-verify: есть (выше)" # cyrillic-ok: shown to the operator
exit $fail
