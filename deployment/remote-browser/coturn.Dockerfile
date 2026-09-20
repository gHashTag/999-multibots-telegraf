# TURN, because Railway remaps ports and WebRTC candidates carry the number.
#
# Measured 2026-09-20: Railway's TCP proxy maps a public port to a different
# application port, and neko's own documentation is explicit -- "expose the
# same ports to the host machine, WITHOUT ANY REMAPPING". `NAT1TO1` fixes the
# address and cannot fix the port, so the candidate a pod offers is a port
# nothing answers on.
#
# A TURN server was the obvious answer, and on Railway it is the WRONG one.
# Checked 2026-09-21 against Railway's own CLI: it offers TCP proxies and
# nothing else, one application port each, no UDP in the product at all.
#
# TURN does not merely accept a connection on 3478 -- it ALLOCATES a relay
# address on an ephemeral port and gives that address to the peer to send to.
# One pre-chosen published port cannot serve that, so the peer has nowhere to
# send. The unreachable port moves one hop and stays unreachable.
#
# This file is therefore a record, not a deployment. It is correct for a host
# with UDP and a port range, which is an ordinary VPS; see coturn.railway.toml
# for the exact flags and the pod variables that go with it.
FROM coturn/coturn:latest
