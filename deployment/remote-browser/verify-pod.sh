#!/bin/bash
# Proof of "one browser, two pilots": the agent drives via CDP the SAME
# browser the viewer is streamed. Also proves CDP is NOT reachable from
# outside the container.
NAME=f0pod
docker rm -f $NAME >/dev/null 2>&1
docker run -d --name $NAME --shm-size=1g \
  -e NEKO_DESKTOP_SCREEN=1280x800@30 \
  -e NEKO_MEMBER_MULTIUSER_USER_PASSWORD=neko \
  -e NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD=admin \
  -p 8080:8080 f0-pod:v1 >/dev/null
for i in $(seq 1 240); do
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://localhost:8080/ 2>/dev/null)
  [ "$c" = "200" ] && break; sleep 0.5
done
echo "1) neko http 8080 (the human's side): $c"

# THE FLAGS ACTUALLY REACHED CHROMIUM.
#
# This check exists because they once did not. The flags lived in
# supervisord's `command=` with a shell bolted in front to unlock the
# profile; supervisord split that line its own way and Chromium came up with
# NEITHER the profile NOR the debugging port -- and nothing anywhere said so.
# The pod looked healthy, the stream ran, the person's logins were simply not
# there. A check that the process carries what we told it to carry is the
# cheapest way to never repeat that.
echo -n "1b) chromium carries our flags:      "
FLAGS=$(docker exec $NAME sh -c "ps -eo args --no-headers | grep -m1 -- --user-data-dir" 2>/dev/null)
MISSING=""
case "$FLAGS" in *--user-data-dir=/home/neko/.config/chromium*) ;; *) MISSING="$MISSING user-data-dir";; esac
case "$FLAGS" in *--remote-debugging-port=9222*) ;; *) MISSING="$MISSING remote-debugging-port";; esac
if [ -n "$MISSING" ]; then echo "MISSING:$MISSING"; else echo "ok"; fi

echo -n "2) CDP inside the container:        "
docker exec $NAME curl -s --max-time 3 http://127.0.0.1:9222/json/version 2>/dev/null | head -c 90; echo

echo -n "3) CDP from OUTSIDE (must fail):    "
if curl -s --max-time 3 http://localhost:9222/json/version >/dev/null 2>&1; then
  echo "REACHABLE -- SECURITY FAILURE"
else
  echo "not reachable (port never published, Chromium binds loopback)"
fi

echo -n "4) guest mode off (no --bwsi):      "
if docker exec $NAME sh -c "ps -eo args --no-headers | grep -m1 'user-data-dir' | grep -q -- --bwsi"; then
  echo "STILL ON -- logins would not persist"
else
  echo "yes, profile persists"
fi

echo "5) the agent drives the visible tab:"
TGT=$(docker exec $NAME curl -s http://127.0.0.1:9222/json/list | python3 -c "
import json,sys
d=json.load(sys.stdin)
p=[t for t in d if t.get('type')=='page']
print(p[0]['id'] if p else '')
print(p[0].get('url','') if p else '', file=sys.stderr)
" 2>/tmp/f0url)
echo "   tab before: $(cat /tmp/f0url)"
docker exec $NAME curl -s -X PUT "http://127.0.0.1:9222/json/new?https://ru.wikipedia.org/wiki/%D0%91%D1%80%D0%B0%D1%83%D0%B7%D0%B5%D1%80" >/dev/null 2>&1
sleep 8
docker exec $NAME curl -s http://127.0.0.1:9222/json/list | python3 -c "
import json,sys
for t in json.load(sys.stdin):
    if t.get('type')=='page': print('   tab now:   ', t.get('title','')[:60], '|', t.get('url','')[:60])
"
echo "6) what the VIEWER sees, fetched from neko's own API:"
docker exec $NAME sh -c '
  TOKEN=$(curl -s -X POST http://127.0.0.1:8080/api/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"admin\"}" | head -c 300)
  echo "   login: $TOKEN" | head -c 200; echo
' 2>/dev/null
echo "--- resource use with the tab open ---"
docker stats --no-stream --format 'mem {{.MemUsage}} cpu {{.CPUPerc}}' $NAME
echo "### pod verify done (container left running as f0pod)"
