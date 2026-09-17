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

# С КАКОГО МОМЕНТА НАЖАТИЯ ВООБЩЕ ЗАПИСЫВАЮТСЯ.
#
# Счётчик, начавший считать позже окна, — это не ноль, это «не мерили».
# 16.09.2026 я доложил владельцу «ноль нажатий на 59 карточек за четверо
# суток», а запись нажатий жила к тому часу ДВА ЧАСА. Ровно та ошибка, что
# исправлялась днём раньше в этом же файле: две величины с разных отрезков.
#
# Дата берётся из истории того файла, который эти записи пропускает, и с
# origin/main — не из рабочей копии (форма 65) и не по памяти (форма 70).
# В UTC, КАК ШТАМПЫ ЖУРНАЛА. `%cI` отдаёт время со смещением автора (+07:00);
# срезать хвост и сравнить с UTC — сдвинуть дату на семь часов в ту сторону,
# где «слишком молодо» превращается в «достаточно старо».
PRESS_SINCE=$(TZ=UTC git -C "$ROOT" log origin/main -1 \
  --date=format-local:'%Y-%m-%dT%H:%M:%S' --format=%cd \
  -S "'card-pressed'" -- apps/vibee-editor/render/src/hive/note-route.ts 2>/dev/null)
export PRESS_SINCE

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
# ОКНО МОЖЕТ БЫТЬ ОБРЕЗАНО, И ЖУРНАЛ ОБ ЭТОМ НЕ СКАЖЕТ.
#
# `hive_events` отдаёт не больше 200 записей, сколько ни проси: запрос на 1000
# вернул ровно 200. Ровно столько, сколько пришло, — признак того, что дальше
# что-то есть, и «за всё окно» тогда значит «за столько, сколько влезло».
if len(ev) >= 200:
    print('  ⚠️ журнал отдал 200 записей — это его потолок. Окно ниже —')
    print('     сколько влезло, а не вся история.')
print('  КАРТОЧКИ — всё за ОДНО окно журнала: %s' % window)
print('    подготовлено %d' % cards)
press_since = (os.environ.get('PRESS_SINCE') or '')[:19].replace('T', ' ')
young = bool(press_since and stamps and press_since.replace(' ', 'T') > stamps[0])
if young:
    # НЕ РАНЬШЕ, ЧЕМ С ЭТОГО ЧАСА. Это момент попадания в main; в проде
    # запись началась ПОЗЖЕ — с ближайшего деплоя. Значит окно наблюдения
    # ещё короче названного, и округлять его в свою пользу нельзя.
    print('    нажато       %d   ⚠️ нажатия пишутся не раньше, чем с %s UTC' % (pressed, press_since))
    print('                     (это попадание в main; в проде — с ближайшего деплоя)')
else:
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
elif young:
    # СЛИШКОМ МОЛОДО, ЧТОБЫ СУДИТЬ (тот же приём, что в `tri books`).
    # Ноль у счётчика, который включили час назад, значит «ещё не мерили»,
    # а не «никто не нажимает». Разница — между наблюдением и наговором.
    print('  ⏳ Судить о нажатиях РАНО: карточки считаются за всё окно, а')
    print('     нажатия — не раньше, чем с %s UTC, и в проде позже.' % press_since)
    print('     Сравнивать эти два числа нельзя; дождитесь полного окна.')
    print()
    # ГРАНИЦА ВМЕСТО ПРИГОВОРА.
    #
    # Отказ от одного вывода — не отказ от всех. Отправок за широкий отрезок
    # не может быть МЕНЬШЕ, чем за его часть, а окно журнала — часть этого
    # отрезка. Значит нажатий внутри окна не больше, чем отправок снаружи, и
    # это утверждение верно без всякого счётчика нажатий.
    print('     Но сказать можно строго: отправок за широкий отрезок — %d,' % sent_all)
    print('     а окно журнала внутри него. Значит из %d карточек нажато' % cards)
    print('     НЕ БОЛЬШЕ %d, и умерло %d.' % (sent_all, died))
elif pressed == 0:
    print('  🛑 НИ ОДНОГО нажатия на %d подготовленных карточек.' % cards)
    print('     Место утечки — между карточкой и нажатием, а не в поиске людей.')
elif pressed * 3 < cards:
    print('  🛑 Подготовлено втрое больше, чем нажато (%d против %d).' % (cards, pressed))
    print('     Место утечки — между карточкой и нажатием.')
else:
    print('  ✅ подготовка и нажатия сопоставимы')
PY
