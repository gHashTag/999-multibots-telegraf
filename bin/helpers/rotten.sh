#!/bin/bash
# tri rotten — какие открытые PR конфликтуют с main и ПОЧЕМУ, сгруппировав
# по общей причине.
#
# ЗАЧЕМ (форма 58). 16.09.2026 за ночь девять моих PR из зелёных стали
# CONFLICTING. Выглядело как девять задач: девять веток, девять разборов,
# полдня. Причина была ОДНА — один тестовый файл, побайтово одинаковый во
# всех девяти: пока они ждали, другая сессия починила ту же стареющую
# фикстуру на main, независимо и другими словами.
#
# Две верные починки одного дефекта — это не конфликт, который разбирают, а
# дубликат, который выбрасывают. Взять содержимое main в этом одном файле —
# и восемь PR стали MERGEABLE без единого merge-коммита; девятый, который
# ЦЕЛИКОМ состоял из этой починки, закрыт.
#
# Поэтому команда печатает не «список конфликтных PR», а список ФАЙЛОВ с
# числом PR, которые каждый держит. Файл, держащий девять, — одна работа,
# а не девять.
set -u
ROOT="${1:?нужен корень репозитория}"
LIMIT="${2:-30}"
cd "$ROOT" || exit 1

command -v gh >/dev/null || { echo "нужен gh"; exit 2; }
git fetch -q origin main 2>/dev/null

PRS=$(gh pr list --limit "$LIMIT" --json number,headRefName,mergeable,title \
      --jq '.[] | [.number, .headRefName, .mergeable, .title] | @tsv' 2>/dev/null)
[ -n "$PRS" ] || { echo "открытых PR не видно (или gh не авторизован)"; exit 2; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
: > "$TMP/pairs"

N=0; BAD=0; UNK=0
while IFS=$'\t' read -r num br able title; do
  [ -n "${num:-}" ] || continue
  N=$((N + 1))
  case "$able" in
    MERGEABLE) continue ;;
    UNKNOWN) UNK=$((UNK + 1)); continue ;;
  esac
  BAD=$((BAD + 1))
  git fetch -q origin "$br" 2>/dev/null || { echo "  #$num: ветки нет на origin"; continue; }
  # merge-tree печатает дерево первой строкой, затем конфликтные записи, и
  # СТОП на первой пустой строке -- дальше идут сообщения. Наивный tail -n +3
  # однажды дал 84 файла вместо 20.
  out=$(git merge-tree --write-tree origin/main "origin/$br" 2>/dev/null)
  printf '%s\n' "$out" | awk 'NR>1 && NF==0{exit} NR>1{print $NF}' |
    grep -v '^$' | sort -u |
    while read -r f; do printf '%s\t%s\n' "$f" "$num"; done >> "$TMP/pairs"
done <<< "$PRS"

echo "── открытых PR: $N; конфликтуют: $BAD; состояние неизвестно: $UNK ──"
echo

if [ ! -s "$TMP/pairs" ]; then
  echo "  ✅ ни один открытый PR не конфликтует с main"
  exit 0
fi

# ГРУППИРОВКА -- ВЕСЬ СМЫСЛ. Один файл на девять PR и девять файлов на
# девять PR выглядят в обычном выводе одинаково и стоят разного.
FILE="$TMP/pairs" python3 - <<'PY'
import io, os, collections
by = collections.defaultdict(set)
for line in io.open(os.environ['FILE'], encoding='utf-8'):
    f, _, num = line.rstrip('\n').partition('\t')
    if f:
        by[f].add(num)
rows = sorted(by.items(), key=lambda kv: (-len(kv[1]), kv[0]))
shared = [r for r in rows if len(r[1]) > 1]
if shared:
    print('  🎯 ОДИН ФАЙЛ ДЕРЖИТ НЕСКОЛЬКО PR — это одна работа, не несколько:')
    for f, nums in shared:
        print('     %-58s %d PR: %s'
              % (f[-58:], len(nums), ' '.join('#' + n for n in sorted(nums))))
    print()
    print('     Сначала проверь, не починено ли это УЖЕ на main другими словами:')
    print('        git diff origin/main -- <файл>')
    print('     Если да — бери содержимое main, и конфликт исчезает без merge.')
    print()
alone = [r for r in rows if len(r[1]) == 1]
if alone:
    print('  каждый сам по себе (%d):' % len(alone))
    for f, nums in alone[:20]:
        print('     %-58s #%s' % (f[-58:], next(iter(nums))))
    if len(alone) > 20:
        print('     … и ещё %d' % (len(alone) - 20))
PY
