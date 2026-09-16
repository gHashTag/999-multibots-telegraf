#!/bin/bash
# tri sweep [строк] — что обходы продавца на самом деле делают в ПРОДЕ.
#
# ЗАЧЕМ (форма 43). Продавец за 90 дней отправил пять карточек, и причину
# этого нельзя было ни угадать, ни вывести из тестов: она видна только в
# логе. 16.09.2026 в 07:02:19 там стояли две строки в одну секунду —
# `did=card` и сразу `did=held`. Это либо второй продавец, придержанный
# карточкой первого, либо один продавец, обойдённый двумя драйверами.
# Различить их по логу было НЕЛЬЗЯ: имени владельца в строке не было.
#
# Команда собирает исходы обходов и считает их по видам. `held` и `busy`,
# которых больше, чем `card`, — это не тишина рынка, а тормоз в коде.
#
# Ничего не отправляет и не меняет: только чтение логов Railway.
set -u
ROOT="${1:?нужен корень репозитория}"
MODE="${2:-hive}"
LINES="${3:-800}"
cd "$ROOT" || exit 1

if [ "$MODE" = "log" ] || [ "$MODE" = "hive" ]; then
  :
else
  # Числом вторым аргументом пользовались до появления режимов — не ломаем.
  case "$MODE" in
    ''|*[!0-9]*) echo "tri sweep [hive|log] [строк]"; exit 2 ;;
    *) LINES="$MODE"; MODE="log" ;;
  esac
fi

# ЖУРНАЛ УЛЬЯ — ИСТОЧНИК ПО УМОЛЧАНИЮ, И ЭТО ГЛАВНОЕ ОТЛИЧИЕ ОТ ЛОГА.
#
# Лог Railway начинается с последнего деплоя: замер 16.09.2026 — окно 48
# минут при кроне раз в полчаса, то есть один-два исхода. Журнал улья хранит
# те же обходы навсегда (noteSweepToHive), и в нём за те же сутки нашлось 76
# записей за пять дней. Разница между «нечего сказать» и «62 карточки против
# пяти касаний» — это выбор источника, а не удача.
#
# Журнал НЕ пишет held и busy: это не обходы, а отложенные. За ними — в лог.
if [ "$MODE" = "hive" ]; then
  AK=$( (railway service vibee-render >/dev/null 2>&1; railway variables --kv 2>/dev/null) |
        grep -E '^AGENT_KEYS=' | cut -d= -f2- | cut -d, -f1 | cut -d: -f1 )
  if [ -z "$AK" ]; then
    echo "🛑 нет ключа агента — журнал не прочитан. Это НЕ значит, что обходов не было."
    echo "   (значение ключа не печатается никогда — только его наличие)"
    exit 2
  fi
  BASE="${RENDER_BASE_URL:-https://vibee-render-production.up.railway.app}"
  RESP=$(curl -s --max-time 60 "$BASE/mcp" -H "X-Agent-Key: $AK" \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"hive_events","arguments":{"limit":200}}}')
  RESP="$RESP" python3 - <<'PYHIVE'
import json, os, re, sys
from collections import Counter, defaultdict

raw = os.environ.get('RESP', '')
try:
    d = json.loads(raw)
except Exception:
    sys.stderr.write('журнал не прочитан (первые 200 знаков):\n%s\n' % raw[:200])
    raise SystemExit(2)
if 'error' in d:
    sys.stderr.write('сервис отказал: %s\n' % str(d['error'].get('message'))[:200])
    raise SystemExit(2)
t = json.loads(d['result']['content'][0]['text'])
allev = t.get('events', [])
ev = [e for e in allev if str(e.get('kind','')).startswith('sweep')]
dropped = [e for e in allev if e.get('kind') == 'card-dropped']

print('── журнал улья: %s ──' % t.get('scope'))
if not ev:
    print('  записей об обходах нет в последних 200 событиях журнала')
    raise SystemExit(0)

print('  обходов в выборке: %d  (%s … %s)'
      % (len(ev), str(ev[-1].get('at'))[:10], str(ev[0].get('at'))[:10]))
print()
per_day = defaultdict(Counter)
per_owner = Counter()
for e in ev:
    per_day[str(e.get('at'))[:10]][str(e.get('kind'))] += 1
    per_owner[str(e.get('who'))] += 1
print('  по дням:')
for day in sorted(per_day):
    print('    %s  %s' % (day, dict(per_day[day])))

print()
print('  по владельцам (id не печатаются):')
for i, (_who, n) in enumerate(per_owner.most_common()):
    print('    продавец #%d: %d' % (i + 1, n))
if len(per_owner) > 1:
    top = per_owner.most_common()
    if top[0][1] > 5 * max(1, top[-1][1]):
        print('    ⚠️  перекос больше чем впятеро: у одного продавца обходов'
              ' на порядок больше, чем у другого.')

fails = [e for e in ev if e.get('kind') == 'sweep-failed']
if fails:
    print()
    print('  падения (%d), без имён:' % len(fails))
    seen = set()
    for f in fails:
        note = re.sub(r'[^\s(]{1,40}\s*\(@[^)]+\)', '<человек>', str(f.get('note') or ''))
        note = note.replace('\n', ' ')[:100]
        if note in seen:
            continue
        seen.add(note)
        print('    %s  %s' % (str(f.get('at'))[:16], note))

cards = sum(1 for e in ev if e.get('kind') == 'sweep-card')
print()
print('  карточек подготовлено: %d' % cards)

# СКОЛЬКО ИЗ НИХ УМЕРЛО, НЕ ДОЙДЯ ДО КЛИЕНТА.
#
# Ноль здесь нельзя печатать как «ничего не потеряно»: до PR #2436 обычная
# текстовая карточка вообще не оставляла следа (фильтр в reportOrphan), и
# отсутствие записей означало отсутствие ЗАПИСИ, а не отсутствие потерь.
if dropped:
    why = Counter(str(e.get('note') or '').split(':')[0] for e in dropped)
    print('  из них ушло в никуда: %d  %s' % (len(dropped), dict(why)))
else:
    print('  сколько из них умерло не дойдя — НЕИЗВЕСТНО: записей card-dropped')
    print('  в журнале нет. Это молчание журнала, а не отсутствие потерь (#2436).')
print('  СРАВНИТЕ с числом отправленных: tri facts (касания «written»).')
print('  Подготовленная карточка ЗАМЕНЯЕТ прошлую неподнажатую — одна на человека.')
PYHIVE
  exit $?
fi

# ВЫВОД ПРОВЕРЯЕМ, А НЕ ПРЕДПОЛАГАЕМ.
#
# `timeout` на macOS НЕТ (он `gtimeout` из coreutils), и `timeout 60 railway
# logs 2>/dev/null` тихо отдаёт пустоту. 16.09.2026 я на этой пустоте чуть
# не написал в отчёт «обход в проде не запускается ни разу». Пустой ответ
# здесь — это отказ с объяснением, а не вывод о проде.
OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT
# --lines/--since, А НЕ `| head` НА ПОТОКЕ.
#
# Без флагов `railway logs` СТРИМИТ, и `head -n N` отдаёт лишь то, что успело
# прийти: 497 строк, сколько ни проси. `--lines`/`--since` — документированный
# способ взять историю, и он даёт вдвое больше.
(railway service 999-multibots-telegraf >/dev/null 2>&1;
 railway logs --since "${SINCE:-24h}" --lines "$LINES" 2>&1 | head -n "$LINES") > "$OUT"
N=$(grep -c . < "$OUT" || true)
if [ "${N:-0}" -lt 5 ]; then
  echo "🛑 Логи не прочитаны (строк: ${N:-0}). Это НЕ значит, что обходов не было."
  echo "   Проверьте: railway whoami; railway service 999-multibots-telegraf"
  exit 2
fi
echo "── прочитано строк лога: $N ──"

LINES_FILE="$OUT" python3 - <<'PY'
import io, json, os, re, sys
from collections import Counter, defaultdict

raw = io.open(os.environ['LINES_FILE'], encoding='utf-8', errors='replace').read()
sweeps = []
for line in raw.split('\n'):
    if '[crm-proactive] sweep' not in line:
        continue
    i = line.find('{')
    if i < 0:
        continue
    try:
        meta = json.loads(line[i:])
    except Exception:
        continue
    at = (re.match(r'\s*(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)', line) or [None, '?'])[1]
    sweeps.append({
        'at': at,
        'owner': str(meta.get('owner') or '?'),
        'did': str(meta.get('did') or '?'),
        # ИМЯ КЛИЕНТА ИЗ ВЫВОДА УБИРАЕТСЯ.
        #
        # `why` у карточки начинается с «Имя (@username): …» -- это живой
        # человек. Вывод этой команды я вставляю в отчёты и обсуждения, а
        # правило дома простое: ни id, ни username, ни имён клиентов за
        # пределами Postgres. Кому карточка -- владелец видит в Telegram.
        'why': re.sub(r'^[^:]{0,60}\(@[^)]+\):\s*', '', str(meta.get('why') or ''))[:80],
    })

if not sweeps:
    print('  обходов в этом окне нет — и это НЕ значит, что их не было.')
    print('  Лог Railway начинается с последнего деплоя: замер 16.09.2026 —')
    print('  окно в 48 минут при кроне раз в полчаса. Долгая история — в')
    print('  журнале улья, куда пишет noteSweepToHive, а не здесь.')
    raise SystemExit(0)

by_did = Counter(s['did'] for s in sweeps)
print('  исходов: %d' % len(sweeps))
for did, n in by_did.most_common():
    print('    %-8s %d' % (did, n))

owners = {s['owner'] for s in sweeps}
print()
if owners == {'?'}:
    print('  ⚠️  ни одна строка не называет владельца.')
    print('     С двумя продавцами «held» неотличим от «чужая карточка держит».')
    print('     Это чинится в reportSweepOutcome (PR #2434).')
else:
    print('  по владельцам:')
    per = defaultdict(Counter)
    for s in sweeps:
        per[s['owner']][s['did']] += 1
    for owner, c in per.items():
        print('    %s: %s' % (owner, dict(c)))

print()
print('  последние:')
for s in sweeps[-6:]:
    print('    %s  %-6s %-8s %s' % (s['at'], s['owner'], s['did'], s['why']))

cards = by_did.get('card', 0)
stuck = by_did.get('held', 0) + by_did.get('busy', 0)
print()
if by_did.get('failed'):
    print('  🛑 есть failed: продавец падает, а не молчит')
    raise SystemExit(1)
if stuck > cards:
    print('  ⚠️  «held»+«busy» (%d) чаще, чем карточек (%d).' % (stuck, cards))
    print('     Это тормоз в коде, а не тишина рынка: смотреть удержание и флаг обхода.')
    raise SystemExit(1)
# ЗЕЛЁНОЕ НА ТРЁХ СТРОКАХ -- НЕ ЗЕЛЁНОЕ.
#
# Окно лога короткое, а крон ходит раз в полчаса: «1 карточка против 1
# удержания» отличается от «всё хорошо» ровно ничем, кроме уверенности
# отвечающего. Такое «✅» читают как замер и перестают проверять.
if len(sweeps) < 6:
    print('  · выводов не делаю: всего %d исход(ов) в окне.' % len(sweeps))
    print('    Лог начинается с последнего деплоя, а крон ходит раз в полчаса,')
    print('    поэтому окно почти всегда короткое. За историей — в журнал улья.')
    raise SystemExit(0)
print('  ✅ обходы доходят до карточек чаще, чем упираются в удержание')
PY
