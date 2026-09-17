#!/bin/bash
# tri deadlines [подстрока] — все сроки проекта в одной таблице, по возрастанию.
#
# ЗАЧЕМ (форма 72). Дефект, стоивший 26 готовых картинок, выглядел так: один
# срок сторожил другой, и сторожащий был КОРОЧЕ охраняемого. Отсрочка обхода —
# 2 часа, жизнь карточки — 12. Обход возвращался, пока карточку ещё можно было
# нажать, рисовал новую и убивал старую вместе с оплаченной картинкой.
#
# Поодиночке обе константы выглядят разумно. Увидеть беду можно только рядом —
# а лежат они в разных файлах и в разных сервисах. Эта команда кладёт их в один
# столбик и сортирует по длительности.
#
# ЭТО СПИСОК, А НЕ ПРИГОВОР. Команда не знает, какой срок кого сторожит: она
# считает арифметику и печатает. Выводы делает человек — ищет пары, где рядом
# стоят «ждать» и «жить», и сравнивает, кто длиннее.
set -u
ROOT="${1:?нужен корень репозитория}"
NEEDLE="${2:-}"
cd "$ROOT" || exit 1

NEEDLE="$NEEDLE" python3 - <<'PYEOF'
import os, re, subprocess, sys

NEEDLE = os.environ.get('NEEDLE', '').lower()

# Имена, которые обозначают СРОК. Ни одно из них не гарантирует, что значение
# в миллисекундах, поэтому единица определяется по имени ниже.
# ЕДИНИЦУ НЕЛЬЗЯ ВЫВОДИТЬ ИЗ СМЫСЛА ИМЕНИ — ТОЛЬКО ИЗ СУФФИКСА.
#
# Первая версия ловила ещё `_CAP` и `_TTL` и печатала «60 мс
# DAILY_GENERATION_CAP» — а это шестьдесят ГЕНЕРАЦИЙ в сутки, не миллисекунды.
# Таблица, придуманная из имени, опаснее отсутствия таблицы: числа выглядят
# сравнимыми и их начинают сравнивать. Остались только суффиксы, которые сами
# называют меру (BACKOFF_CAP_MS проходит по `_MS`, как и должен), и TIMEOUT —
# единственное слово, которое в этом репозитории всегда в миллисекундах.
NAME = re.compile(
    r'^\s*(?:export\s+)?const\s+([A-Z][A-Z0-9_]*(?:_MS|_MINUTES|_SECONDS|_HOURS|_DAYS|TIMEOUT))\s*=\s*([^;/\n]+)',
)
# Только арифметика из чисел: ничего не исполняем сверх этого.
SAFE = re.compile(r'^[\d_\s*+()]+$')

def unit_ms(name: str) -> float:
    if name.endswith('_MINUTES'): return 60_000
    if name.endswith('_SECONDS'): return 1_000
    if name.endswith('_HOURS'):   return 3_600_000
    if name.endswith('_DAYS'):    return 86_400_000
    return 1  # _MS и TIMEOUT — миллисекунды

def human(ms: float) -> str:
    if ms < 1000: return f'{int(ms)} мс'
    s = ms / 1000
    if s < 90: return f'{s:g} с'
    m = s / 60
    if m < 90: return f'{m:g} мин'
    h = m / 60
    if h < 48: return f'{h:g} ч'
    return f'{h/24:g} сут'

files = subprocess.run(
    ['git', 'ls-files', '*.ts'], capture_output=True, text=True
).stdout.split()
rows = []
for f in files:
    if '.test.' in f or '/node_modules/' in f:
        continue
    try:
        text = open(f, encoding='utf-8').read()
    except Exception:
        continue
    for line in text.splitlines():
        m = NAME.match(line)
        if not m:
            continue
        name, raw = m.group(1), m.group(2).strip()
        if not SAFE.match(raw):
            continue
        try:
            value = eval(raw.replace('_', ''), {'__builtins__': {}}, {})
        except Exception:
            continue
        if not isinstance(value, (int, float)) or value <= 0:
            continue
        rows.append((value * unit_ms(name), name, f))

if NEEDLE:
    rows = [r for r in rows if NEEDLE in r[1].lower() or NEEDLE in r[2].lower()]
if not rows:
    print('🛑 не нашёл ни одного срока. Либо фильтр слишком узкий, либо')
    print('   регулярное выражение перестало совпадать с тем, как их пишут.')
    sys.exit(2)

rows.sort()
print(f'сроков найдено: {len(rows)}   (мера — из ИМЕНИ: _MS, _MINUTES, _HOURS…)')
print()
width = max(len(r[1]) for r in rows)
for ms, name, f in rows:
    print(f'  {human(ms):>9}  {name:<{width}}  {f}')
print()
print('  Ищите ПАРЫ на одну сущность: «сколько ждать» и «сколько живёт».')
print('  Если сторожащий срок КОРОЧЕ охраняемого — он молча рушит охраняемое')
print('  каждый раз, когда истекает (форма 72).')
PYEOF
