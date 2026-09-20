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
 && apt-get install -y --no-install-recommends socat \
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

COPY chromium.conf /etc/neko/supervisord/chromium.conf
COPY cdp-bridge.conf /etc/neko/supervisord/cdp-bridge.conf
