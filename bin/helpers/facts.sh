#!/bin/bash
# tri facts — на чём стоят выводимые факты CRM и не пуст ли этот фундамент.
#
# ЗАЧЕМ (форма 37). 16.09.2026 два инструмента одного сервиса ответили на один
# вопрос по-разному в одну минуту:
#
#     crm_waiting  ->    2 человека ждут ответа
#     crm_summary  ->  316 человек ждут ответа
#
# Оба считали честно — из РАЗНЫХ фактов. В `crm_touches` лежало пять строк на
# 2394 человека, и ни одной `replied`; в `crm_messages` — 25 302 входящих.
# Инструмент, у которого вся работа — «кто ждёт ответа», читал пустую таблицу.
#
# Ни один тест этого не видел и не мог: оба пути зелены, расходятся они только
# на настоящих данных. Поэтому замер — команда, а не намерение.
#
# Ничего не пишет и ничего не отправляет: только `crm_summary`, только цифры.
set -u
ROOT="${1:?нужен корень репозитория}"
BASE="${2:-https://vibee-render-production.up.railway.app}"

# Ключ агента живёт в переменной и наружу не выходит (скилл mcp-owner-access).
AK=$( (railway service vibee-render >/dev/null 2>&1; railway variables --kv 2>/dev/null) |
      grep -E '^AGENT_KEYS=' | cut -d= -f2- | cut -d, -f1 | cut -d: -f1 )
if [ -z "$AK" ]; then
  echo "нет ключа агента: railway недоступен или AGENT_KEYS пуст"
  echo "  (значение ключа не печатается никогда — только его наличие)"
  exit 2
fi

RESP=$(curl -s --max-time 60 "$BASE/mcp" \
  -H "X-Agent-Key: $AK" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"crm_summary","arguments":{}}}')

# ОТВЕТ ПЕРЕДАЁТСЯ ОКРУЖЕНИЕМ, А НЕ КОНВЕЙЕРОМ.
#
# `python3 - <<'PY'` читает САМУ ПРОГРАММУ со стандартного ввода, поэтому
# `printf ... | python3 - <<'PY'` — тихая ловушка: труба съедена heredoc-ом, а
# `sys.stdin.read()` внутри возвращает пустое. Первая версия этой команды так и
# напечатала «ответ не разобран» на совершенно исправном ответе в 6993 байта.
# Тот же класс, что и «передал аргументом, читаю из окружения» часом раньше.
RESP="$RESP" python3 - <<'PY'
import json, os, sys

raw = os.environ.get('RESP', '')
try:
    d = json.loads(raw)
except Exception:
    sys.stderr.write('ответ не разобран (первые 200 знаков):\n%s\n' % raw[:200])
    raise SystemExit(2)
if 'error' in d:
    sys.stderr.write('сервис отказал: %s\n' % d['error'].get('message', '')[:200])
    raise SystemExit(2)
s = json.loads(d['result']['content'][0]['text'])

people = s.get('people_known', 0)
msgs = s.get('messages', {}) or {}
inbound = msgs.get('inbound', 0)
touches = s.get('touches_by_kind', {}) or {}
total_touches = sum((v or {}).get('total', 0) for v in touches.values())

print('── на чём стоят факты ──')
print('  людей:             %s' % people)
print('  сообщений входящих: %s' % inbound)
print('  касаний всего:      %s' % total_touches)
for k, v in sorted(touches.items()):
    n = (v or {}).get('total', 0)
    if n:
        print('    %-9s %s' % (k, n))
print()

# ГЛАВНОЕ СРАВНЕНИЕ: один вопрос, два источника.
from_msgs = s.get('waiting_for_reply', 0)
by_touch = s.get('waiting_by_touch', {}) or {}
from_touch = sum(by_touch.values())
print('── «кто ждёт ответа», два ответа ──')
print('  по переписке: %s' % from_msgs)
print('  по касаниям:  %s  (%s)' % (from_touch, by_touch))

bad = 0
if from_msgs and from_touch == 0:
    print()
    print('  🛑 ВЫВОД СТОИТ НА ПУСТОМ ЖУРНАЛЕ: переписка знает %s, касания — ноль.' % from_msgs)
    print('     Инструмент, который читает только касания, отвечает «никто не ждёт».')
    bad = 1
elif from_msgs and from_touch and max(from_msgs, from_touch) > 5 * max(1, min(from_msgs, from_touch)):
    print()
    print('  ⚠️  РАЗНИЦА БОЛЬШЕ ЧЕМ В ПЯТЬ РАЗ. Модель получает оба числа и не знает, какому верить.')
    bad = 1

if inbound > 100 and touches.get('replied', {}).get('total', 0) == 0:
    print()
    print('  🛑 НИ ОДНОГО касания «replied» при %s входящих.' % inbound)
    print('     Никто не записывает ответ человека: журнал ведёт модель, а она забывает.')
    print('     Всё, что выводится из «кто ответил», считает по пустому.')
    bad = 1

print()
if bad:
    print('  Что делать: выводимый факт брать из того источника, который НАПОЛНЕН,')
    print('  а пустой держать как уточнение, — и никогда наоборот.')
else:
    print('  ✅ источники не расходятся: выводимые факты стоят на непустом фундаменте')
raise SystemExit(1 if bad else 0)
PY
