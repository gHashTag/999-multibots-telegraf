#!/bin/bash
# tri hdl MODE [--top NAME] FILE... -- run Verilog through the SAME runner the
# RTL and FPGA engineers use (render src/agent/hdl-run.ts: hdl_run), with the
# same sandbox rules (no file I/O tasks, `include of own files only, empty
# environment, deadline). MODE: lint (verilator) | sim (iverilog + vvp) |
# synth (yosys synth_xilinx; stat, needs --top). Needs the tools installed.
#
#   tri hdl sim --top tb fifo.v tb.v
#   tri hdl synth --top fifo fifo.v
set -u
ROOT="${1:?repo root required}"
shift
MODE="${1:-}"; shift || true
TOP=""
if [ "${1:-}" = "--top" ]; then TOP="${2:-}"; shift 2 || true; fi
[ -n "$MODE" ] && [ $# -gt 0 ] || { echo "usage: tri hdl lint|sim|synth [--top NAME] FILE..."; exit 2; }
FILES_JSON=$(python3 -c '
import json, os, sys
print(json.dumps([{"name": os.path.basename(p), "content": open(p).read()} for p in sys.argv[1:]]))' "$@") || exit 2
cd "$ROOT/apps/vibee-editor/render" || exit 2
HDL_MODE="$MODE" HDL_TOP="$TOP" HDL_FILES="$FILES_JSON" npx --no-install tsx -e '
const { runHdl } = require("./src/agent/hdl-run")
runHdl({ mode: process.env.HDL_MODE, top: process.env.HDL_TOP || undefined, files: JSON.parse(process.env.HDL_FILES) }, { telegramId: "tri" })
  .then(r => {
    if (!r.ran) { console.log("not run:", r.reason); process.exit(2) }
    for (const s of r.steps) console.log(`$ ${s.command}\n(exit ${s.exit}${s.timedOut ? ", timed out" : ""})\n${s.output}\n`)
    console.log(r.passed ? "PASSED" : "FAILED"); process.exit(r.passed ? 0 : 1)
  })' 2>&1 | grep -v ExperimentalWarning
