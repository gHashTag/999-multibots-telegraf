#!/bin/bash
# Numeric parity check: Swift spring vs Remotion, frame by frame.
#
# WHY THIS EXISTS. A green build proves nothing about a renderer — every real
# defect in this engine produced a wrong PICTURE, not a wrong program. The
# only check that means anything is comparing numbers against the renderer
# that is actually shipping.
#
# WHY REMOTION IS CALLED DIRECTLY, not reimplemented: Remotion's spring
# IGNORES damping when overdamped. Verified — damping 39, 50, 200, 1000 and
# 100000 at stiffness 380 all return 0.900713359446 at frame 6, while an
# honest ODE solver returns 0.311987. A "correct" spring would be visibly
# wrong against production. So the reference must come from the real module,
# never from a formula I believe to be right.
#
#   ./parity/check.sh          all nine shipped spring configs, 61 frames each
#
# Tolerance is 1e-9: double-precision noise sits around 5e-15, so anything
# above the threshold is a real divergence, not rounding.

set -euo pipefail
cd "$(dirname "$0")"
NODE="${NODE_BIN:-node}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "▸ reference from Remotion"
"$NODE" ref.js > "$TMP/ref.json"

echo "▸ Swift"
cp ../Vibee/Animation.swift ../Vibee/Composition.swift "$TMP/"
cp main.swift "$TMP/"
swiftc -O -o "$TMP/parity" "$TMP/Animation.swift" "$TMP/Composition.swift" "$TMP/main.swift" 2>&1 \
  | grep -E 'error:' && { echo "❌ Swift did not build"; exit 1; } || true
"$TMP/parity" > "$TMP/swift.json"

python3 - "$TMP/ref.json" "$TMP/swift.json" <<'PY'
import json, sys
ref = json.load(open(sys.argv[1])); sw = json.load(open(sys.argv[2]))
TOL = 1e-9
bad = 0
print(f"{'config':<20} {'max diff':>14}  frame")
for k in ref:
    r, s = ref[k]['values'], sw[k]
    m, f = max((abs(a - b), i) for i, (a, b) in enumerate(zip(r, s)))
    ok = m < TOL
    bad += 0 if ok else 1
    print(f"{k:<20} {m:>14.3e}  {f:>5}  {'ok' if ok else 'DIVERGES'}")
if bad:
    print(f"\n{bad} config(s) diverge beyond {TOL}. This is a real defect, not rounding.")
    sys.exit(1)
print(f"\nall {len(ref)} configs match Remotion within {TOL}")
PY
