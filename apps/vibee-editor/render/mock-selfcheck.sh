#!/usr/bin/env bash
# Самодостаточная проверка ВСЕХ функций через mock: поднять → 84 проверки → убить.
#
# Лучшая практика: тест не зависит от внешнего состояния — сам поднимает mock на
# отдельном порту, гоняет mock-test.py и гасит сервер (trap на EXIT). Падает
# ГРОМКО (код возврата python пробрасывается), без `|| true`. Быстро (~5с),
# ничего не тратит. Ставится в lefthook pre-push.
#
# THE SERVER IS STOPPED BY ITS PROCESS GROUP, NEVER BY PORT (2026-10-04).
# The trap used to be `kill "$(lsof -ti:"$PORT")"`. `lsof -i:N` lists EVERY
# process with a socket on port N at either end -- a client still connected,
# rapportd talking to a peer whose port happens to be N (measured on this Mac:
# 114 ephemeral port numbers in use at once). Two pids came back, the quotes
# made them ONE argument "pid1\npid2", kill refused it, `|| true` hid that, and
# the server lived on. Its subshell still held the hook's stdout, lefthook reads
# to EOF, and a push hung for 18 minutes until GitHub dropped the connection.
# Reproduced with a foreign client on the port: the script exited 0 at +4 s,
# the pipe stayed open. Unquoting would have been worse -- it kills the
# stranger. So:
#   - the server runs as its own job under `set -m`, i.e. its own process
#     group (npm exec -> tsx -> node -> esbuild all share it), and the trap
#     stops exactly that group, then waits for it to be gone (SIGKILL after 4-5 s);
#   - the job writes to the log and reads /dev/null, so even a survivor could
#     not hold the hook's pipe (same class as cloud-check.sh's watchdog sleep);
#   - no lsof and no curl: python3 (already needed by mock-test.py) probes the
#     port, so the script and its test also run on the Linux check runner.
# Test: mock-selfcheck.test.ts; mutants: mock-selfcheck.mutants.json.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

# Exit 0 when something accepts a TCP connection on localhost:$1.
port_answers() {
  python3 -c 'import socket,sys; socket.create_connection(("localhost", int(sys.argv[1])), 1).close()' "$1" >/dev/null 2>&1
}
# Exit 0 when $1 answers HTTP 2xx.
http_ok() {
  python3 -c 'import sys,urllib.request; urllib.request.urlopen(sys.argv[1], timeout=2)' "$1" >/dev/null 2>&1
}

# A free port of its own unless one is asked for. A fixed 3399 meant every run
# killed whatever held it first, so two pushes from two worktrees killed each
# other's server and both failed "did not come up" (2026-10-03).
# An asked-for port that is busy is refused, not cleared: whoever listens there
# is not ours to kill, and a run of this script no longer leaves a server behind.
if [ -n "${MOCK_SELFCHECK_PORT:-}" ]; then
  PORT="$MOCK_SELFCHECK_PORT"
  if port_answers "$PORT"; then
    echo "mock-selfcheck: port :$PORT is already taken by another process -- left alone; pick another MOCK_SELFCHECK_PORT"
    exit 1
  fi
else
  PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
fi
LOG="/tmp/mock-selfcheck.$PORT.log"
# Seconds to wait for the server. A deadline, not a count: a healthy start
# still returns in ~2 s, but 16 s was too short for tsx on a loaded Mac.
WAIT_S="${MOCK_SELFCHECK_WAIT_S:-120}"

# SIGTERM to the whole group, then SIGKILL once 4-5 s of WALL CLOCK have
# passed ($SECONDS is whole seconds). Not a count of `sleep 0.1` rounds: at a
# load average of ~410 (2026-10-04) 50 rounds took 6.6-7.7 s, not 5, and a
# count stretches further the more the machine starves -- with a server that
# ignores SIGTERM, the push waits that whole time.
SERVER_GROUP=""
stop_server() {
  [ -n "$SERVER_GROUP" ] || return 0
  local g="$SERVER_GROUP" deadline=$((SECONDS + 5))
  SERVER_GROUP=""
  kill -TERM -- "-$g" 2>/dev/null || return 0
  while kill -0 -- "-$g" 2>/dev/null; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      kill -KILL -- "-$g" 2>/dev/null
      break
    fi
    sleep 0.1
  done
}
trap stop_server EXIT
# A hook interrupted by Ctrl-C or a dropped session still goes through the
# EXIT trap; the server's group is not the terminal's, so nothing else stops it.
# bash 3.2 runs the EXIT trap on a fatal TERM, INT or HUP even without these
# (measured: same cleanup, the script dies by the signal instead of exiting
# 143/130/129). They stay for the plain exit status, and so the cleanup does
# not depend on bash running a trap from inside its signal handler.
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# `set -m` makes the job a process group of its own, with the job's pid as the
# group id; `exec` makes that pid npx itself. `disown` keeps bash from printing
# "Terminated" when the trap stops it.
set -m
( cd "$HERE" && MOCK_PORT="$PORT" exec npx tsx mock-server.ts ) </dev/null >"$LOG" 2>&1 &
SERVER_GROUP=$!
set +m
disown "$SERVER_GROUP"
echo "mock-selfcheck: server group $SERVER_GROUP on :$PORT, log $LOG"

up=""
deadline=$(( $(date +%s) + WAIT_S ))
while [ "$(date +%s)" -lt "$deadline" ]; do
  if http_ok "http://localhost:$PORT/health"; then up=1; break; fi
  sleep 0.4
done
if [ -z "$up" ]; then
  echo "mock-selfcheck: сервер не поднялся на :$PORT за ${WAIT_S} с"; tail -5 "$LOG"; exit 1
fi

MOCK_BASE="http://localhost:$PORT" python3 "$HERE/mock-test.py"
rc=$?
[ "$rc" -eq 0 ] && rm -f "$LOG"
exit "$rc"
