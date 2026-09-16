#!/bin/bash
# tri funnel — воронка владельца одним экраном, как у конкурентов доской.
#
# ЗАЧЕМ. Замер конкурентов 16.09.2026 (страницы взяты curl-ом, читал меню и
# заголовки — внутренности их продуктов мне недоступны):
#
#   amoCRM/Kommo — «Воронка продаж», «Digital воронка», доска «board-like
#                  view that gives you the big picture», аналитика
#   Salebot      — CRM, «просматривайте аналитику продаж», умные триггеры
#   TextBack     — каскадные цепочки, напоминания, AI Agent для продаж
#
# У КАЖДОГО из них воронка — это ЭКРАН, первоклассный объект продукта.
# У нас воронка есть только числами внутри crm_summary, и владелец видит их,
# лишь если модель их процитирует. Отсюда и главная беда недели: 62 карточки
# подготовлено, 5 отправлено — и ни одного места, где непрожатая карточка
# видна как застрявшая.
#
# Эта команда — тот самый экран, пока его нет в интерфейсе. Только чтение.
set -u
ROOT="${1:?нужен корень репозитория}"
cd "$ROOT" || exit 1

AK=$( (railway service vibee-render >/dev/null 2>&1; railway variables --kv 2>/dev/null) |
      grep -E '^AGENT_KEYS=' | cut -d= -f2- | cut -d, -f1 | cut -d: -f1 )
if [ -z "$AK" ]; then
  echo "🛑 нет ключа агента — воронка не прочитана. Это НЕ пустая воронка."
  exit 2
fi
BASE="${RENDER_BASE_URL:-https://vibee-render-production.up.railway.app}"
call() {
  curl -s --max-time 60 "$BASE/mcp" -H "X-Agent-Key: $AK" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$1\",\"arguments\":$2}}"
}
SUM=$(call crm_summary '{}')
EV=$(call hive_events '{"limit":200}')

SUM="$SUM" EV="$EV" python3 - <<'PY'
import json, os, sys
from collections import Counter

def unpack(raw, what):
    try:
        d = json.loads(raw)
    except Exception:
        sys.stderr.write('%s: ответ не разобран\n' % what)
        raise SystemExit(2)
    if 'error' in d:
        sys.stderr.write('%s: сервис отказал: %s\n' % (what, str(d['error'].get('message'))[:120]))
        raise SystemExit(2)
    return json.loads(d['result']['content'][0]['text'])

s = unpack(os.environ['SUM'], 'crm_summary')
ev = unpack(os.environ['EV'], 'hive_events').get('events', [])

print('── воронка владельца ──')
print('  людей в памяти: %s, из них с перепиской: %s, платили: %s'
      % (s.get('people_known'), s.get('people_with_messages'), s.get('paid')))
print()

stages = s.get('by_stage', {}) or {}
order = ['new', 'written', 'talking', 'later', 'client', 'winback', 'refused']
print('  ЭТАПЫ (кто где):')
width = max([stages.get(k, 0) for k in order] + [1])
for k in order:
    n = stages.get(k, 0)
    bar = '█' * max(0, round(28 * n / width)) if n else ''
    print('    %-9s %5d %s' % (k, n, bar))

nxt = s.get('by_next', {}) or {}
print()
print('  СЛЕДУЮЩИЙ ШАГ (что делать):')
for k in ('reply', 'deliver', 'offer', 'talk', 'wait'):
    print('    %-9s %5d' % (k, nxt.get(k, 0)))

# THE LEAK. The one number a board makes obvious and a list never does.
cards = sum(1 for e in ev if e.get('kind') == 'sweep-card')
dropped = sum(1 for e in ev if e.get('kind') == 'card-dropped')
refused = sum(1 for e in ev if e.get('kind') == 'gift-refused')
touches = (s.get('touches_by_kind') or {})
sent = (touches.get('written') or {}).get('total', 0)
print()
print('  КАРТОЧКИ (в окне журнала):')
print('    подготовлено %d' % cards)
print('    отправлено   %d   (касания «written» за всё время)' % sent)
if dropped:
    print('    умерло       %d' % dropped)
else:
    print('    умерло       НЕИЗВЕСТНО — записей card-dropped нет (PR #2436)')
if refused:
    print('    подарок отказан %d (PR #2440 включён)' % refused)

print()
if cards and sent * 3 < cards:
    print('  🛑 Подготовлено втрое больше, чем отправлено. Место утечки —')
    print('     между карточкой и нажатием, а не в поиске людей.')
elif not cards:
    print('  · карточек в окне журнала нет — окно короткое, не вывод о продавце')
else:
    print('  ✅ подготовка и отправка сопоставимы')
PY
