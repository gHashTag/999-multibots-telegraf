#!/bin/bash
# tri code [--lang ts|js] FILE -- run a TS/JS program through the SAME runner
# the coding scientist uses (render src/agent/code-run.ts: code_run), in the
# same Deno sandbox (every permission denied, empty environment, deadline).
# Needs Deno installed (the service image installs it).
#
#   tri code solve.ts
#   tri code --lang js quick.js
#   echo 'console.log(1+1)' | tri code -
set -u
ROOT="${1:?repo root required}"
shift
LANG_ARG="ts"
if [ "${1:-}" = "--lang" ]; then LANG_ARG="${2:-ts}"; shift 2 || true; fi
FILE="${1:-}"
[ -n "$FILE" ] || { echo "usage: tri code [--lang ts|js] FILE   (FILE '-' reads stdin)"; exit 2; }
if [ "$FILE" = "-" ]; then CODE=$(cat); else CODE=$(cat "$FILE") || exit 2; fi
cd "$ROOT/apps/vibee-editor/render" || exit 2
CODE_LANG="$LANG_ARG" CODE_SRC="$CODE" npx --no-install tsx -e '
const { runCode } = require("./src/agent/code-run")
runCode({ lang: process.env.CODE_LANG, code: process.env.CODE_SRC }, { telegramId: "tri" })
  .then(r => {
    if (!r.ran) { console.log("not run:", r.reason); process.exit(2) }
    console.log(`(exit ${r.exit}${r.timedOut ? ", timed out" : ""})\n${r.output}`)
    console.log(r.passed ? "PASSED" : "FAILED"); process.exit(r.passed ? 0 : 1)
  })' 2>&1 | grep -v ExperimentalWarning
