#!/bin/bash
# tri queue [сколько] — очередь открытых PR: что от чего зависит и в каком порядке.
#
# ЗАЧЕМ. 16.09.2026 замер показал две очереди, устроенные одинаково: продавец
# готовит 13.5 карточек в сутки, а нажимают не больше пяти в месяц; я открываю
# по два-три PR за виток, а открытых накопилось тридцать. В обоих случаях
# производство обгоняет рассмотрение, и в обоих случаях помогает не «ещё одна
# штука», а понятный порядок.
#
# Команда отвечает на один вопрос: что можно слить ПРЯМО СЕЙЧАС, а что стоит
# в очереди за чужой веткой. PR, стоящий на другом PR, до его слияния сливать
# нельзя — и это видно только по base, который в списке обычно не показывают.
set -u
ROOT="${1:?нужен корень репозитория}"
LIMIT="${2:-40}"
cd "$ROOT" || exit 1

command -v gh >/dev/null 2>&1 || { echo "🛑 нет gh — вывода НЕ делаю."; exit 2; }

RAW=$(gh pr list --state open --limit "$LIMIT" \
  --json number,title,baseRefName,headRefName,mergeable,createdAt,updatedAt,isDraft 2>/dev/null)
if [ -z "$RAW" ]; then
  echo "🛑 gh не отдал список PR — вывода НЕ делаю."
  echo "   Пустой список и недоступный список выглядят одинаково."
  exit 2
fi

RAW="$RAW" python3 - <<'PYEOF'
import json, os, sys
from datetime import datetime, timezone

try:
    prs = json.loads(os.environ['RAW'])
except Exception:
    print('🛑 список PR не разобрался как JSON — вывода НЕ делаю.'); sys.exit(2)
if not prs:
    print('🛑 открытых PR ноль. Это либо правда, либо фильтр; вывода НЕ делаю.')
    sys.exit(2)

now = datetime.now(timezone.utc)
heads = {p['headRefName']: p['number'] for p in prs}

# ВОЗРАСТ — ОТ СОЗДАНИЯ, А НЕ ОТ ПОСЛЕДНЕГО КАСАНИЯ.
#
# Первая версия считала по `updatedAt`, и все тридцать семь PR вышли
# «сегодняшними»: GitHub обновляет запись, когда двигается main и он
# пересчитывает пригодность к слиянию. То есть поле честно говорило «когда
# его последний раз трогали», а я подписал его словом «возраст» — и раздел
# «старше недели» не сработал бы никогда.
def age_days(p, field='createdAt'):
    try:
        t = datetime.fromisoformat(p[field].replace('Z', '+00:00'))
        return (now - t).total_seconds() / 86400
    except Exception:
        return -1

# ЧЕЙ BASE — ЧУЖАЯ ВЕТКА, ТОТ СТОИТ В ОЧЕРЕДИ.
stacked, ready = [], []
for p in prs:
    (stacked if p['baseRefName'] in heads else ready).append(p)

MARK = {'MERGEABLE': '✅', 'CONFLICTING': '🛑', 'UNKNOWN': '· '}

def line(p, pad=''):
    a = age_days(p)
    age = f'{a:.0f}д' if a >= 1 else 'сегодня'
    quiet = age_days(p, 'updatedAt')
    if a >= 1 and quiet >= 1:
        age = f'{a:.0f}д'
    d = ' [черновик]' if p.get('isDraft') else ''
    print(f'{pad}  {MARK.get(p["mergeable"], "? ")} #{p["number"]:<5} {age:>7}  {p["title"][:62]}{d}')

print(f'открытых PR: {len(prs)}   свободных: {len(ready)}   стоят за другим PR: {len(stacked)}')
print()
print('── МОЖНО СЛИВАТЬ (base = main) ──')
for p in sorted(ready, key=age_days):
    line(p)

if stacked:
    print()
    print('── СТОЯТ В ОЧЕРЕДИ: сначала тот, на ком стоят ──')
    for p in sorted(stacked, key=age_days):
        print(f'  ждёт #{heads[p["baseRefName"]]}:')
        line(p, '  ')

old = [p for p in prs if age_days(p) > 7]
if old:
    print()
    print(f'⚠️  старше недели: {len(old)} — их автор, скорее всего, уже забыл контекст:')
    for p in sorted(old, key=age_days, reverse=True)[:6]:
        line(p)

bad = [p for p in prs if p['mergeable'] == 'CONFLICTING']
if bad:
    print()
    print(f'🛑 конфликтуют с main: {len(bad)}. Их нельзя слить, не разобрав:')
    for p in bad[:6]:
        line(p)
    print('   Причину по общим файлам покажет:  tri rotten')
    sys.exit(1)
sys.exit(0)
PYEOF
