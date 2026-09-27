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
# These flags say: this browser is always watched. Occlusion is not a reason
# to background a window, a background renderer is not a reason to throttle
# it, and the memory-saver features that discard and freeze tabs are off.
exec /usr/bin/chromium \
  --no-sandbox \
  --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding \
  --disable-background-timer-throttling \
  --disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling,HighEfficiencyModeAvailable,FreezingOnEnergySaver \
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
