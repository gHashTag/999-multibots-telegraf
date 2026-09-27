#!/bin/sh
# ONE BINARY FOR SUPERVISORD TO RUN, so there is nothing left to mis-parse.
#
# The flags used to live in `command=` in chromium.conf, and the profile
# unlock was bolted on in front of them as `/bin/sh -c "...; exec chromium
# <flags>"`. supervisord split that line its own way and the flags NEVER
# REACHED CHROMIUM: it came up on the default profile, with no remote
# debugging port. Measured in the running pod -- the browser process showed
# only neko's own CHROMIUM_FLAGS and an empty "$@".
#
# That is worse than the bug it was added for: the person's profile was not
# being used at all, and the agent had no way in.
#
# So supervisord now runs exactly one path with no arguments and no quotes,
# and everything that needs saying is said here, in a shell that is really a
# shell.
set -e

/usr/local/bin/unlock-profile.sh || true

# --bwsi is deliberately ABSENT. It means "browse without sign-in" (guest
# mode), where the profile is thrown away, and persistent logins the person
# creates themselves are the entire product.
#
# --remote-debugging-port is how an agent drives the very browser the person
# is watching. Headful Chromium ignores --remote-debugging-address and binds
# CDP to loopback only (measured 2026-09-20), which is what we want: this
# port must never be published out of the container, because whoever reaches
# CDP reads every cookie and acts as the person.
# A FROZEN TAB DOES NOT ANSWER THE AGENT AT ALL.
#
# Measured in the live pod 2026-09-27, one browser, three questions:
#
#   Runtime.evaluate on the FRONT tab              -> answers at once
#   Runtime.evaluate on a BACKGROUND tab           -> silence until timeout
#   Runtime.evaluate on a tab just created         -> silence, url still ""
#
# Nobody is looking at this window the way Chromium counts looking, so it
# treats every tab but the front one as hidden and freezes the renderer;
# a frozen renderer takes the command and never runs it. That is not a slow
# page, it is no page: the Reddit desk reported "the inbox did not answer"
# while the account was signed in and holding unread replies, because the tab
# it opened was frozen before it ever loaded.
#
# AND WAKING EVERY TAB AT ONCE IS NOT THE CURE. Measured half an hour later,
# same pod: with renderer backgrounding and the memory-saver freeze disabled,
# the profile's 27 restored tabs all came up as live renderers and the
# container ran out of process slots -- `crun: fork: Resource temporarily
# unavailable`, no shell, no CDP list. A browser that cannot fork is worse
# than a browser with a frozen tab.
#
# So only the WINDOW-level economies are off -- this window is watched by a
# person over neko even when nothing is occluding it, and its timers must
# keep time -- while per-tab freezing stays as Chromium ships it. Waking the
# ONE tab it is about to use is the agent's job, and it does it by activating
# that tab first (agent/reddit-wiring.ts). The person's tabs survive a restart
# by the owner's own decision (RestoreOnStartup 1 in the Dockerfile), so the
# number of tabs is not something this file gets to assume away.
exec /usr/bin/chromium \
  --no-sandbox \
  --disable-backgrounding-occluded-windows \
  --disable-background-timer-throttling \
  --window-position=0,0 \
  --display="${DISPLAY}" \
  --user-data-dir=/home/neko/.config/chromium \
  --no-first-run \
  --start-maximized \
  --force-dark-mode \
  --disable-file-system \
  --disable-gpu \
  --disable-software-rasterizer \
  --disable-dev-shm-usage \
  --remote-debugging-port=9222
