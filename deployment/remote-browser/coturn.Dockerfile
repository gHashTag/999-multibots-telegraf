# TURN, because Railway remaps ports and WebRTC candidates carry the number.
#
# Measured 2026-09-20: Railway's TCP proxy maps a public port to a different
# application port, and neko's own documentation is explicit -- "expose the
# same ports to the host machine, WITHOUT ANY REMAPPING". `NAT1TO1` fixes the
# address and cannot fix the port, so the candidate a pod offers is a port
# nothing answers on.
#
# A TURN server sidesteps the whole question: the browser and the pod both
# connect OUT to it, and neither has to be reachable at a predictable port.
# That is the standard answer to exactly this shape of network, and it is why
# it exists.
FROM coturn/coturn:latest
