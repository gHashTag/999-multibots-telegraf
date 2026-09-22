# ATTRIBUTION.
#
# Built FROM ghcr.io/m1k1o/neko/chromium (https://github.com/m1k1o/neko),
# Apache License 2.0. Its LICENSE and notices are inside the image and are
# not modified here; this file records the change we make to it.
#
# The engine's name is not shown in the window (owner's decision,
# 2026-09-21). That is permitted: Apache-2.0 attaches its notice duties to
# DISTRIBUTING the work, and running it as a hosted service is not that.
# Its trademarks are not used -- that part was never optional.
#
# The per-client browser pod: one Chromium, three control surfaces.
#   - the person watches and takes over via neko's WebRTC stream (8080)
#   - the agent drives the same browser via CDP (9223, private network only)
#   - the profile is a volume, so logins outlive the pod
# Same process, same profile, same cookies. See
# docs/architecture/remote-browser-per-user.md.
FROM ghcr.io/m1k1o/neko/chromium:latest

# socat exists for ONE reason, and it is measured: headful Chromium ignores
# --remote-debugging-address and binds CDP to 127.0.0.1 inside the container,
# so nothing outside the container can reach it -- not even a process on the
# same private network. socat forwards a second port to that loopback.
#
# THIS PORT IS NEVER PUBLISHED TO THE INTERNET. Whoever reaches CDP reads
# every cookie in the profile and acts as the person; it is for the broker on
# the private network, and for nobody else.
#
# DO NOT ADD `USER neko` HERE. The base image runs as ROOT and `neko` is an
# ENVIRONMENT VARIABLE that its supervisord configs read (`user=%(ENV_USER)s`)
# to drop privileges themselves. Switching the image user makes supervisord a
# non-root process that cannot drop anything, and the container dies at start
# with `Can't drop privilege as nonroot user` -- measured 2026-09-20.
RUN apt-get update \
 && apt-get install -y --no-install-recommends socat jq \
 && rm -rf /var/lib/apt/lists/*

# THE AGENT COULD NOT DRIVE THE BROWSER, AND THIS IS WHY.
#
# neko's image ships an enterprise policy with `DeveloperToolsAvailability: 2`
# -- DevTools disallowed. Measured against a live pod: the CDP HTTP endpoints
# answer normally, `Browser.getVersion` on the browser socket answers, and
# then `Target.attachToTarget` returns `Not allowed` while a page's own socket
# accepts the connection and never replies to anything. Three symptoms, one
# cause, and none of them says the word "policy".
#
# 1 is `DeveloperToolsAllowed`. It is flipped HERE rather than by deleting the
# file, so every other restriction that image sets -- no extensions, no
# password manager, no file dialogs -- stays exactly as it was.
#
# What this does NOT open: the CDP port is still on the private bridge and
# still never published (see cdp-bridge.conf).
RUN sed -i 's/"DeveloperToolsAvailability": 2/"DeveloperToolsAvailability": 1/' \
      /etc/chromium/policies/managed/policies.json \
 && grep -q '"DeveloperToolsAvailability": 1' /etc/chromium/policies/managed/policies.json

# The stale-lock sweeper. See the script for what it saw and why it is safe.
COPY own-profile.sh /usr/local/bin/own-profile.sh
COPY unlock-profile.sh /usr/local/bin/unlock-profile.sh
COPY start-chromium.sh /usr/local/bin/start-chromium.sh
RUN chmod +x /usr/local/bin/own-profile.sh /usr/local/bin/unlock-profile.sh /usr/local/bin/start-chromium.sh

# THE PERSON'S TOUCH TAKES CONTROL. neko's default is implicit_hosting=false:
# a viewer's clicks are ignored until they press neko's own "request
# control" icon, which nobody on a phone knows to do -- the owner could not
# press a single button on a Google page by hand (2026-09-22). With implicit
# hosting the first touch takes control. The agent drives over CDP, not
# neko, so this changes nothing for it; who holds the wheel is ours
# (sessions.ts), not neko's.
ENV NEKO_SESSION_IMPLICIT_HOSTING=true

COPY chromium.conf /etc/neko/supervisord/chromium.conf
COPY cdp-bridge.conf /etc/neko/supervisord/cdp-bridge.conf

# ── POLICY, EDITED AS JSON AND CHECKED ───────────────────────────────────
#
# Chromium ignores a policy file it cannot parse -- ALL of it, blocklists
# included -- so the file is edited with jq and read back, never with sed.
#
# TRANSLATE OFF. Chromium offered "Russian | English" over every page the
# owner opened, in the middle of the picture, photographed twice.
#
# BITWARDEN IN. Moving somebody's passwords in bulk is the one thing this
# browser should never do through us: the owner's rule is that the person
# types secrets themselves, inside the stream, and they reach the pod and
# nothing else. A password manager the person unlocks inside the stream does
# exactly that for all of them at once. Allowed and installed; nobody is
# signed in to it until the person does it themselves.
#
# CHROMIUM'S OWN PASSWORD STORE STAYS OFF (PasswordManagerEnabled false, as
# upstream ships it). On Linux without a keyring it keeps passwords behind a
# fixed key, and whoever drives the browser -- the agent included -- could
# open chrome://password-manager and read them.
#
# OUR PAGE BY DEFAULT. Owner, 2026-09-21: an empty browser opens t27.ai. A
# new tab and the home button land there; RestoreOnStartup 1 keeps the
# person's own tabs across a restart, so t27.ai is what an EMPTY browser
# shows, never something that replaces what they had open.
RUN jq '.TranslateEnabled = false \
      | .NewTabPageLocation = "https://t27.ai/" \
      | .HomepageLocation = "https://t27.ai/" \
      | .HomepageIsNewTabPage = false \
      | .ShowHomeButton = true \
      | .RestoreOnStartup = 1 \
      | .ExtensionInstallForcelist += ["nngceckbapebfimnlniiiahkandclblb;https://clients2.google.com/service/update2/crx"] \
      | .ExtensionInstallAllowlist += ["nngceckbapebfimnlniiiahkandclblb"]' \
      /etc/chromium/policies/managed/policies.json > /tmp/policies.json \
 && mv /tmp/policies.json /etc/chromium/policies/managed/policies.json \
 && jq -e '.TranslateEnabled == false \
      and .PasswordManagerEnabled == false \
      and .DeveloperToolsAvailability == 1 \
      and .NewTabPageLocation == "https://t27.ai/" \
      and .HomepageLocation == "https://t27.ai/" \
      and .RestoreOnStartup == 1 \
      and any(.ExtensionInstallBlocklist[]; . == "*") \
      and any(.ExtensionInstallAllowlist[]; . == "nngceckbapebfimnlniiiahkandclblb")' \
      /etc/chromium/policies/managed/policies.json

# The profile lives on a volume; see own-profile.sh. It hands the mount to
# the neko user and then runs the image's own CMD.
CMD ["/usr/local/bin/own-profile.sh"]

