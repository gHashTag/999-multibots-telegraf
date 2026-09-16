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
import json, os, re, sys
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

# СУДЬБА КАРТОЧКИ — ТОЛЬКО ВНУТРИ ОДНОГО ОКНА.
#
# Здесь стояло: «подготовлено 59» (за окно журнала, трое суток) против
# «отправлено 5» (касания written ЗА ВСЁ ВРЕМЯ) — и поверх них вывод «втрое
# больше». Две величины, измеренные по разным отрезкам, поставленные рядом и
# поделённые друг на друга. Направление угадано верно, число — бессмысленно.
#
# И вторая беда: смерти карточек искались по виду `card-dropped`, которого в
# журнале нет — пишется `draft-unsent` (а в записях постарше тот же текст
# лежит под видом `failure`). Инструмент печатал «НЕИЗВЕСТНО» и ссылался на
# PR, который давно слит под другим именем, пока рядом лежали семнадцать
# погибших карточек.
DRAFT_GONE = re.compile(r'черновик\s+\S+\s+(cancelled|replaced|expired|failed)')

def is_death_iter(events):
    return [e for e in events if is_death(e)]

# ПОЛЕ НАЗЫВАЕТСЯ `note`, А НЕ `text`.
#
# Событие улья приходит как {at, kind, who, bot, note, severity}. Поля `text`
# в нём НЕТ ВООБЩЕ — и `e.get('text') or ''` отдаёт пустую строку на каждой
# записи, тихо и правдоподобно. Так эта функция не нашла ни одной смерти
# среди сорока подходящих записей, а `tri turn-time` печатал пустой столбец
# пояснений и ни разу на это не пожаловался.
def note_of(e):
    return str(e.get('note') or e.get('text') or '')

def is_death(e):
    if e.get('kind') == 'draft-unsent':
        return True
    # Записи до переименования: вид `failure`, текст тот же.
    return e.get('kind') == 'failure' and DRAFT_GONE.search(note_of(e))

if ev and not any(note_of(e) for e in ev):
    print()
    print('  🛑 ни в одной записи журнала нет пояснения — похоже, поле')
    print('     переименовали. Считать смерти карточек по пустоте нельзя,')
    print('     раздел КАРТОЧКИ пропущен.')
    raise SystemExit(2)

cards = sum(1 for e in ev if e.get('kind') == 'sweep-card')
pressed = sum(1 for e in ev if e.get('kind') == 'card-pressed')
died = sum(1 for e in is_death_iter(ev))
refused = sum(1 for e in ev if e.get('kind') == 'gift-refused')
touches = (s.get('touches_by_kind') or {})
sent_all = (touches.get('written') or {}).get('total', 0)

stamps = sorted(str(e.get('at') or e.get('created_at') or '')[:19] for e in ev)
stamps = [x for x in stamps if x]
window = ('%s … %s' % (stamps[0], stamps[-1])) if stamps else 'пусто'

print()
print('  КАРТОЧКИ — всё за ОДНО окно журнала: %s' % window)
print('    подготовлено %d' % cards)
print('    нажато       %d' % pressed)
print('    умерло       %d   (вытеснено, истекло, отменено)' % died)
unknown = cards - pressed - died
if unknown > 0:
    print('    судьба неизвестна %d — ещё ждут или запись о них вне окна' % unknown)
if refused:
    print('    подарок отказан %d' % refused)
print()
print('  Для сравнения, ЗА ВСЁ ВРЕМЯ (другой отрезок, рядом не делить):')
print('    касаний «written»: %d' % sent_all)

print()
if not cards:
    print('  · карточек в окне журнала нет — окно короткое, не вывод о продавце')
elif pressed == 0:
    print('  🛑 НИ ОДНОГО нажатия на %d подготовленных карточек.' % cards)
    print('     Место утечки — между карточкой и нажатием, а не в поиске людей.')
elif pressed * 3 < cards:
    print('  🛑 Подготовлено втрое больше, чем нажато (%d против %d).' % (cards, pressed))
    print('     Место утечки — между карточкой и нажатием.')
else:
    print('  ✅ подготовка и нажатия сопоставимы')
PY
