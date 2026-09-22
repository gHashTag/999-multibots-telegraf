#!/bin/bash
# DOES THIS TRINITY PR CARRY A WORK REPORT THE GATE WILL ACCEPT?
#
# gHashTag/trinity refuses a PR without a <!-- t27-work-report --> block
# whose head_sha is the PR's current head. On 2026-09-22 the report was
# rebuilt by hand three times after a new commit, and the local validator
# was fed a hand-made event that it refused for reasons unrelated to the
# report (missing repository, state, merged). Here the event is the PR
# exactly as GitHub's REST API returns it, so the only thing judged is
# the report itself.
#
#   tri work-report <PR number> [owner/repo]    default repo: gHashTag/trinity
# Validates with scripts/pr_blog_report.py from origin/main of the local
# trinity checkout (TRINITY_ROOT, default ~/trinity). Also says plainly
# when head_sha is stale -- the commonest failure. Exit 0 valid, 1 not.
set -uo pipefail
PR="${1:?usage: tri work-report <PR number> [owner/repo]}"
REPO="${2:-gHashTag/trinity}"
TROOT="${TRINITY_ROOT:-$HOME/trinity}"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
gh api "repos/$REPO/pulls/$PR" > "$TMP/pr.json" 2>/dev/null || { echo "work-report: cannot read $REPO#$PR"; exit 1; }
python3 - "$TMP/pr.json" "$REPO" > "$TMP/event.json" <<'PY'
import json, sys
pr = json.load(open(sys.argv[1]))
print(json.dumps({"action": "synchronize", "number": pr["number"], "repository": {"full_name": sys.argv[2]}, "pull_request": pr}))
PY
python3 - "$TMP/pr.json" <<'PY'
import json, re, sys
pr = json.load(open(sys.argv[1]))
m = re.search(r'"head_sha"\s*:\s*"([0-9a-f]{40})"', pr.get("body") or "")
head = pr["head"]["sha"]
if not m:
    print("  no head_sha in the body")
elif m.group(1) != head:
    print(f"  STALE head_sha {m.group(1)[:9]} -- PR head is {head[:9]}: refresh the report")
else:
    print(f"  head_sha matches {head[:9]}")
PY
git -C "$TROOT" fetch -q origin main 2>/dev/null
git -C "$TROOT" show origin/main:scripts/pr_blog_report.py > "$TMP/validator.py" 2>/dev/null || { echo "work-report: no validator in $TROOT"; exit 1; }
mkdir -p "$TMP/out"
if (cd "$TMP" && python3 validator.py validate --event event.json --output out 2>&1 | tail -3); then :; fi
if (cd "$TMP" && python3 validator.py validate --event event.json --output out >/dev/null 2>&1); then
  echo "  work report: VALID"; exit 0
fi
echo "  work report: REFUSED"; exit 1
