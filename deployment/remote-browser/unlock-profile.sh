#!/bin/sh
# A PROFILE LEFT LOCKED BY A POD THAT DIED IS A BROWSER THAT NEVER OPENS AGAIN.
#
# Measured 2026-09-21. A pod was stopped hard (`docker rm -f`), a new one
# started on the same profile volume, and Chromium refused:
#
#   The profile appears to be in use by another Chromium process (9) on
#   another computer (dc597a44e921).
#   exited: chromium (exit status 21; not expected)
#   gave up: chromium entered FATAL state, too many start retries too quickly
#
# `dc597a44e921` is the PREVIOUS CONTAINER'S hostname, left behind in
# `SingletonLock`. supervisord then gives up for good, so the person's window
# is black for as long as the pod lives, with nothing on screen saying why.
# Every hard stop reaches this: the idle reaper, a redeploy, an OOM kill, a
# host restart.
#
# WHY REMOVING IT IS SAFE, AND NOT A SHORTCUT.
#
# The lock exists to stop two Chromiums sharing one profile and corrupting
# it. That cannot happen here: `browser_sessions` has `telegram_id` as its
# PRIMARY KEY, so one person has at most one pod, and a pod is the only thing
# that mounts its own profile volume. The guarantee is in the database, one
# layer up. What the lock actually protects against is impossible by
# construction; what it actually does is brick the profile after a crash.
#
# So: remove it, and ONLY when it names a computer that is not this one --
# a live lock from this very container would still mean something.
set -e
PROFILE="/home/${USER:-neko}/.config/chromium"
[ -d "$PROFILE" ] || exit 0

LOCK="$PROFILE/SingletonLock"
[ -L "$LOCK" ] || exit 0

OWNER=$(readlink "$LOCK" | sed 's/-[0-9]*$//')
if [ "$OWNER" = "$(hostname)" ]; then
  echo "singleton lock belongs to this container ($OWNER); leaving it"
  exit 0
fi

echo "clearing a singleton lock left by $OWNER (this is $(hostname))"
rm -f "$PROFILE/SingletonLock" "$PROFILE/SingletonCookie" "$PROFILE/SingletonSocket"
