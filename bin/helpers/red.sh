#!/bin/bash
# WHAT IS RED ON MAIN, AND WHAT DOES EACH RED CHECK SAY?
#
# Done by hand five times in one night (2026-10-02) on gHashTag/trinity-fpga:
# list the check runs of main's head, pick the failures, fetch each job log,
# and read past the echoed workflow source and the runner's cleanup chatter to
# the three lines that say why. One of those times the answer was a gate that
# went red only BECAUSE another gate had just turned green (gates-can-fail
# could test it at last) -- so look at the whole list after every merge, not
# only at the check you were fixing.
#
#   tri red [owner/repo] [ref]      default: this repo, main
#   RED_LINES=N                     log lines kept per failure (default 12)
#
# Each failure names the step that stopped the job ("failed step:"), taken
# from the steps' own conclusions, not guessed from the last ##[error] in the
# log: a continue-on-error step prints ##[error] too and concludes success.
#
# Read-only. Exit 0 nothing failed, 1 something failed (named, with its log
# tail), 2 could not tell (no answer from GitHub, unknown ref).
set -uo pipefail
ROOT="$1"; shift
REPO="${1:-}"; REF="${2:-main}"
if [ -z "$REPO" ]; then
  REPO=$(cd "$ROOT" && gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null) \
    || { echo "red: cannot tell which repo -- pass owner/repo"; exit 2; }
fi
KEEP="${RED_LINES:-12}"

# Stock macOS has no `timeout` (coreutils ships it as `gtimeout`). Calling a
# missing `timeout` exits 127, which this script would read as "GitHub did not
# answer" -- a wrong verdict. Use whichever exists, else run without a limit.
if command -v timeout >/dev/null 2>&1; then lim() { timeout "$@"; }
elif command -v gtimeout >/dev/null 2>&1; then lim() { gtimeout "$@"; }
else lim() { shift; "$@"; }
fi

# gh api prints the error body on stdout when it fails, so keep an answer only
# when gh exited 0 -- a 404 page is not a SHA.
SHA=$(lim 30 gh api "repos/$REPO/commits/$REF" --jq .sha 2>/dev/null) || SHA=
[ -n "$SHA" ] || { echo "red: $REPO@$REF did not answer"; exit 2; }

RUNS=$(lim 60 gh api --paginate "repos/$REPO/commits/$SHA/check-runs?per_page=100" \
  --jq '.check_runs[] | [(.conclusion // .status), .id, .name, .html_url] | @tsv' 2>/dev/null) \
  || { echo "red: check runs of $REPO@${SHA:0:9} did not answer"; exit 2; }
[ -n "$RUNS" ] || { echo "red: $REPO@${SHA:0:9} has no check runs (yet?) -- cannot tell"; exit 2; }

echo "  $REPO @ ${SHA:0:9} ($REF)"
printf '%s\n' "$RUNS" | cut -f1 | sort | uniq -c | sort -rn | sed 's/^/  /'

BAD=$(printf '%s\n' "$RUNS" | awk -F'\t' '$1 ~ /^(failure|timed_out|cancelled|action_required|startup_failure)$/')
if [ -z "$BAD" ]; then
  pend=$(printf '%s\n' "$RUNS" | awk -F'\t' '$1 ~ /^(queued|in_progress|pending|waiting|requested)$/' | wc -l | tr -d ' ')
  [ "$pend" -gt 0 ] && echo "  nothing failed; $pend still running -- not yet green"
  [ "$pend" -eq 0 ] && echo "  nothing failed"
  exit 0
fi

# The step that failed, from a job log: drop timestamps, keep the LAST step that
# raised ##[error], strip its echoed header and colour, keep the tail.
step_tail() {
  sed -E 's/^[0-9]{4}-[0-9-]+T[0-9:.]+Z //; s/\r$//' \
    | awk '
        # Keep only the LAST step that raised an ##[error] -- from its
        # "##[group]Run" header to the next step. Not the first: a
        # continue-on-error step (trinity-fpga Build & Test, "Build VIBEE
        # subproject (non-blocking)") raises one too, and the job goes on.
        # After the step that really fails, the rest are skipped, so its error
        # is the last one. Lines of other steps (checkout advice, python setup
        # paths) are not why it failed. With no ##[error] at all, what is left
        # is the last step, the usual culprit.
        function keep_if_err() {
          if (!err) return
          for (i = 1; i <= n; i++) kept[i] = buf[i]
          k = n; err = 0
        }
        /^Post job cleanup/ { exit }
        # The step header -- its echoed script, shell and env -- sits between
        # "##[group]Run" and the next endgroup; what the step printed comes
        # after. Only that group is a header: a group the step opens itself
        # (::group:: around test output) can hold the very line that says why.
        /^##\[group\]Run / { keep_if_err(); n = 0; hdr = 1 }
        /^##\[endgroup\]/ { if (hdr) { hdr = 0; next } }
        !hdr { buf[++n] = $0 }
        /^##\[error\]/ { err = 1 }
        END {
          keep_if_err()
          if (k) for (i = 1; i <= k; i++) print kept[i]
          else for (i = 1; i <= n; i++) print buf[i]
        }' \
    | grep -v -E $'^\e\\[36;1m|^##\\[(group|endgroup)\\]|^\\[command\\]|^shell: |^env:|^  [A-Z_]+: ' \
    | sed -E $'s/\e\\[[0-9;]*m//g' \
    | grep -v -E '^\s*$' \
    | tail -n "$KEEP" | sed 's/^/    /'
}

while IFS=$'\t' read -r concl id name url; do
  echo
  echo "  ✗ $name  ($concl)"
  echo "    $url"
  # The log echoes the step's script (ESC[36;1m lines), the runner's group
  # markers, every earlier step's setup and, after the verdict, a page of git
  # cleanup. None of it is why.
  # gh run view --log-failed asks the jobs API which steps CONCLUDED failure
  # and cuts the job log to them. A continue-on-error step concludes success
  # there, so it never shows; an if: always() step that fails after the real
  # one does show -- hence the FIRST failed step is the cause, and the others
  # are only named. (The run's log archive no longer holds a file per step;
  # gh 2.83 splits the job log itself.) An older gh, or a check that is not an
  # Actions job, answers nothing: then the whole job log and the last-error
  # heuristic below.
  FAILED=$(lim 90 gh run view -R "$REPO" --job "$id" --log-failed 2>/dev/null </dev/null) || FAILED=
  FIRST=$(printf '%s\n' "$FAILED" | awk -F'\t' 'NF >= 3 { print $2; exit }')
  TAIL=
  if [ "$FIRST" = "UNKNOWN STEP" ]; then
    # gh could not cut the log by step (seen live: a job whose log gh cannot
    # line up with its step list) and hands back the WHOLE log under this
    # label. The label is gh's, not the job's: name the step from the jobs API
    # and let the last-error heuristic read the whole log.
    NAMES=$(lim 60 gh api "repos/$REPO/actions/jobs/$id" \
      --jq '[.steps[] | select(.conclusion == "failure") | .name] | join("\t")' 2>/dev/null </dev/null) || NAMES=
    [ -n "$NAMES" ] && echo "    failed step: ${NAMES%%$'\t'*}"
    case "$NAMES" in *$'\t'*) echo "    then also failed: ${NAMES#*$'\t'}" | sed $'s/\t/, /g' ;; esac
    TAIL=$(printf '%s\n' "$FAILED" | awk -F'\t' 'NF >= 3' \
      | cut -f3- | sed $'s/^\xef\xbb\xbf//' | step_tail)
  elif [ -n "$FIRST" ]; then
    echo "    failed step: $FIRST"
    OTHERS=$(printf '%s\n' "$FAILED" | awk -F'\t' -v f="$FIRST" 'NF >= 3 && $2 != f && !seen[$2]++ { print $2 }' | paste -sd, - | sed 's/,/, /g')
    [ -n "$OTHERS" ] && echo "    then also failed: $OTHERS"
    TAIL=$(printf '%s\n' "$FAILED" | awk -F'\t' -v f="$FIRST" 'NF >= 3 && $2 == f' \
      | cut -f3- | sed $'s/^\xef\xbb\xbf//' | step_tail)
  fi
  if [ -z "$TAIL" ]; then
    # Same rule as for the SHA: on failure gh prints the error body (an expired
    # log is an Azure BlobNotFound XML page) on stdout, so filter only a log
    # that gh actually returned. One retry: under load the first fetch of a
    # fresh log sometimes times out.
    LOG=$(lim 60 gh api "repos/$REPO/actions/jobs/$id/logs" 2>/dev/null </dev/null) \
      || LOG=$(lim 60 gh api "repos/$REPO/actions/jobs/$id/logs" 2>/dev/null </dev/null) \
      || LOG=
    # Judge by what came out, not by the pipeline's status: awk exits at the
    # failing step, and on a log larger than a pipe buffer the sed feeding it
    # then dies of SIGPIPE -- pipefail would call a readable log unreadable.
    TAIL=$(printf '%s\n' "$LOG" | step_tail)
  fi
  if [ -n "$TAIL" ]; then printf '%s\n' "$TAIL"
  else echo "    (log not readable -- open the link)"; fi
done <<< "$BAD"
exit 1
