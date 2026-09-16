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
LINES="${2:-800}"
cd "$ROOT" || exit 1

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
