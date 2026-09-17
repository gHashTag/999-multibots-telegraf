#!/bin/bash
# tri stale [номер…] — не сделано ли то, что лежит в PR, УЖЕ на main.
#
# ЗАЧЕМ. Открытых PR тридцать семь, двадцать конфликтуют с main, самому
# старому 318 дней. Читать их все — работа на день, и большая часть этой
# работы бесполезна: за месяцы та же беда чинилась другими словами, и PR
# держится не потому, что нужен, а потому, что никто не проверял.
#
# Команда сверяет СОДЕРЖИМОЕ, а не заголовки: берёт добавленные в PR строки и
# смотрит, сколько из них уже есть в main дословно.
#
# ЭТО УЛИКА, А НЕ ПРИГОВОР. Совпадение строк не доказывает, что решена та же
# задача: можно добавить те же три строки ради разного. Поэтому вывод —
# «сколько процентов добавленного уже на main», и решение принимает человек.
# Ни один PR эта команда не закрывает.
set -u
ROOT="${1:?нужен корень репозитория}"
shift || true
cd "$ROOT" || exit 1

command -v gh >/dev/null 2>&1 || { echo "🛑 нет gh — вывода НЕ делаю."; exit 2; }
git fetch -q origin main 2>/dev/null || true

LIST="$*"
if [ -z "$LIST" ]; then
  LIST=$(gh pr list --state open --limit 60 --json number -q '.[].number' 2>/dev/null)
fi
[ -n "$LIST" ] || { echo "🛑 список PR пуст — вывода НЕ делаю."; exit 2; }

for N in $LIST; do
  DIFF=$(gh pr diff "$N" 2>/dev/null)
  if [ -z "$DIFF" ]; then
    printf '  ?  #%-6s не отдался diff — пропускаю, вывода по нему НЕТ\n' "$N"
    continue
  fi
  TITLE=$(gh pr view "$N" --json title -q .title 2>/dev/null | cut -c1-44)
  DIFF="$DIFF" TITLE="$TITLE" N="$N" python3 - <<'PYEOF'
import os, re, subprocess, sys

diff = os.environ['DIFF']
num = os.environ['N']

# Только СОДЕРЖАТЕЛЬНЫЕ добавленные строки. Пустые, скобки, импорты и прочий
# каркас совпадают всегда и сделали бы «уже на main» из любого PR.
added, files = [], set()
cur = None
for line in diff.splitlines():
    if line.startswith('+++ b/'):
        cur = line[6:]
        files.add(cur)
        continue
    if not line.startswith('+') or line.startswith('+++'):
        continue
    body = line[1:].strip()
    if len(body) < 24:
        continue
    if re.match(r'^(import|export \{|\}|\)|\{|//|\*|#)', body):
        continue
    added.append((cur, body))

if not added:
    print(f'  ·  #{num:<6} нечего сверять: ни одной содержательной строки')
    sys.exit(0)

def main_text(path):
    r = subprocess.run(['git', 'show', f'origin/main:{path}'],
                       capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None

cache, hit, miss, gone = {}, 0, 0, 0
for path, body in added:
    if path not in cache:
        cache[path] = main_text(path)
    text = cache[path]
    if text is None:
        gone += 1          # файла на main нет — это новая работа, не дубль
        continue
    if body in text:
        hit += 1
    else:
        miss += 1

known = hit + miss
pct = (hit * 100 // known) if known else 0
# СЛИШКОМ МАЛАЯ ВЫБОРКА — ЭТО НЕ СТО ПРОЦЕНТОВ, А ДВЕ СТРОКИ.
#
# #2432 дал «100% (2/2)» и встал первым в списке кандидатов на закрытие. Две
# совпавшие строки не говорят ни о чём: столько же совпадёт у любых двух
# правок одного файла. Тот же приём, что у `tri books` с молодой таблицей и у
# `tri funnel` с молодым счётчиком — мало данных значит «судить нельзя», а не
# «доказано».
ENOUGH = 10
# ПРОЦЕНТ СЧИТАЕТСЯ ТОЛЬКО ПО ФАЙЛАМ, КОТОРЫЕ НА MAIN ЕСТЬ.
#
# #2394 показал «93% уже на main» — и я чуть не предложил его закрыть. А его
# содержимое, план на 431 строку и тест к нему, лежит в файлах, которых на
# main НЕТ ВОВСЕ: они в знаменатель не попали. Процент был посчитан по
# меньшей части работы и описывал не ту часть, ради которой PR открыт.
#
# Поэтому: если строк в отсутствующих файлах больше, чем сравнимых, — процент
# не вердикт, и говорить об этом надо ВМЕСТО процента, а не после него.
if gone > known:
    mark = '?'
    pct_note = (f'{pct}% по {known} сравнимым строкам, НО {gone} строк — в файлах, '
                f'которых на main нет: это НОВАЯ работа')
elif known < ENOUGH:
    mark = '?'
    pct_note = f'{pct}% — но всего {known} сравнимых строк, судить НЕЛЬЗЯ'
else:
    mark = '🟡' if pct >= 90 else ('·' if pct >= 40 else '  ')
    pct_note = None
# ИМЯ ПОДПИСИ — ИЗ ТОГО, ЧТО СЧИТАЕТСЯ, А НЕ ИЗ ТОГО, ЧТО ХОТЕЛОСЬ.
# `gone` считает СТРОКИ, лежащие в файлах, которых на main нет, а подпись
# сперва говорила «новых файлов». Третий такой промах за сутки: раньше
# `updatedAt` был подписан «возрастом», а предел по количеству —
# миллисекундами. Подпись врёт тише кода и живёт дольше.
extra = f', строк в файлах, которых на main нет: {gone}' if gone else ''
if pct_note:
    print(f'  {mark} #{num:<6} {pct_note}  {os.environ["TITLE"]}')
else:
    print(f'  {mark} #{num:<6} {pct:3d}% добавленного уже на main '
          f'({hit}/{known}{extra})  {os.environ["TITLE"]}')
PYEOF
done
echo
echo "  🟡 = почти всё добавленное уже есть на main. УЛИКА, не приговор:"
echo "     прочитайте такой PR первым — вероятно, он закрывается без слияния."
