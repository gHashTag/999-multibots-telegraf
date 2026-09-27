#!/bin/bash
# MEND THE BROWSER, BUT ONLY IF IT IS ACTUALLY BROKEN.
#
# The one failure that a restart cures and only a restart cures is the PID
# ceiling: the pod's cgroup runs out of processes, the zygote never recovers,
# old tabs keep answering and every new tab hangs forever. Until now nothing an
# agent could reach performed that restart -- `/api/browser/round` refuses an
# agent key by design -- so in September the pod stayed unreadable for three
# days waiting for a person to notice.
#
# The other half of the lesson is why this command cannot just restart. On
# 27.09.2026 I restarted a HEALTHY browser: `browser_status` said
# `running: false` because it was reading a visit row the idle reaper had
# deleted, and the watch had that same pod answering for 16 minutes with eleven
# live pages on it. So the service probes the browser at the moment of the
# request and REFUSES while it answers. "Не буду" is the good outcome here.
#
#   tri heal          проверить и, если браузер молчит, перезапустить
#   tri heal --json   сырой ответ
# Exit 0 браузер здоров или вылечен, 2 не смог спросить, 3 перезапустил и всё
# равно молчит (Chromium надо поднимать внутри пода).
set -uo pipefail
ROOT="$1"; shift
JSON="${1:-}"
B="${RENDER_BASE:-https://vibee-render-production.up.railway.app}"
MAIN=$(git -C "$ROOT" worktree list --porcelain | awk 'NR==1{print $2}')
AK="${AGENT_KEY:-}"
if [ -z "$AK" ]; then
  AK=$( (cd "${MAIN:-$ROOT}" && railway variables --service vibee-render --kv 2>/dev/null) \
        | grep -E '^AGENT_KEYS=' | cut -d= -f2- | cut -d, -f1 | cut -d: -f1 )
fi
[ -n "$AK" ] || { echo "heal: нет ключа агента (railway login?) -- не спросил"; exit 2; }

# A restart takes a while, and the route waits for the browser to come back.
ANSWER=$(curl -s -m 240 -X POST "$B/api/browser/heal" -H "X-Agent-Key: $AK")
[ -n "$ANSWER" ] || { echo "heal: сервис не ответил -- не спросил"; exit 2; }

ANSWER="$ANSWER" JSON="$JSON" python3 - <<'PY'
import json, os, sys
try:
    d = json.loads(os.environ.get("ANSWER") or "")
except Exception:
    print("heal: ответ не разобран -- не спросил"); sys.exit(2)
if os.environ.get("JSON") == "--json":
    print(json.dumps(d, ensure_ascii=False)); sys.exit(0)
if not d.get("ok"):
    print("heal: отказ:", str(d.get("error") or d)[:200]); sys.exit(2)
why = str(d.get("why") or "")
if not d.get("healed"):
    if "answers" in why:
        # The refusal, and the whole point of the command.
        print("heal: браузер отвечает -- НЕ трогаю. Перезапуск отнял бы у")
        print("      человека рабочий браузер, а это ровно та ошибка,")
        print("      от которой этот маршрут и написан.")
        sys.exit(0)
    print("heal: перезапустил, браузер всё равно молчит.")
    print("      Chromium надо поднимать внутри пода:", why[:120])
    sys.exit(3)
print("heal: браузер молчал, перезапущен, снова отвечает.",
      "(под реально перезагрузился)" if d.get("rebooted") else
      "(тот же boot id -- отвечает, но под не перезагружался)")
sys.exit(0)
PY
