#!/bin/sh
# The WebRTC port relay. Runs ONLY when the two port numbers differ.
#
# WHY THIS EXISTS. neko puts its TCP-mux LISTEN port into the ICE candidate,
# so the number the browser dials is the number neko listens on -- nothing
# in between may remap it (neko's own docs: "expose the same ports to the
# host machine, without any remapping"). Railway's TCP proxy does exactly
# what that forbids: it publishes one platform-chosen port (19409) and
# delivers to another inside the pod (52000). A pod configured the obvious
# way -- mux on 52000 -- advertises 52000, the browser dials 52000 at the
# proxy's address, and the mouse is dead. That was the state measured on
# 2026-09-29: stream up, control down, viewer in "watching as pictures".
#
# The cure keeps the invariant on BOTH sides of the proxy:
#
#   neko listens on the PROXY's public port (19409, NEKO_WEBRTC_TCPMUX)
#   socat takes the proxy's delivery port (52000) and forwards to 19409
#
# so the candidate says 19409, the proxy delivers to 52000, and the relay
# closes the gap. One extra loopback hop inside the container, measured as
# irrelevant next to WebRTC-over-TCP itself.
#
# WHY A SCRIPT AND NOT A BARE SOCAT LINE. Locally (docker driver) the mux
# port IS published unchanged and no relay is wanted -- and a relay from a
# port to ITSELF would be a fork bomb, not a relay. supervisord cannot make
# a command conditional, so the decision lives here: same numbers -- sleep,
# different numbers -- relay.
set -eu

MUX="${NEKO_WEBRTC_TCPMUX:-52000}"
LISTEN="${WEBRTC_RELAY_LISTEN_PORT:-52000}"

if [ "$MUX" = "$LISTEN" ]; then
  # Same port inside and out: the platform delivers straight to neko and a
  # relay would only bounce packets to itself. Present, but inert.
  exec sleep infinity
fi

exec /usr/bin/socat \
  "TCP-LISTEN:${LISTEN},pf=ip6,ipv6only=0,fork,reuseaddr" \
  "TCP:127.0.0.1:${MUX}"
