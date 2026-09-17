#!/bin/bash
# tri vs-main <команда…> — прогнать команду на ЧИСТОМ main, не трогая рабочее дерево.
#
# ЗАЧЕМ (форма 57, и она повторилась). Вопрос «а это падает и без моих правок?»
# возникает каждую смену, и рука сама тянется к `git stash`. Это худший из
# доступных способов: stash молчит, возвращает ноль и уносит незакоммиченное.
#
# 16.09.2026 я дважды за два витка сделал ровно это. Во второй раз — через
# день после того, как записал форму 57 «git stash из семьи reset --hard».
# Знание формы не помогло: помогает отсутствие повода.
#
# Поэтому команда. Она делает отдельную копию на origin/main, гоняет там и
# убирает за собой; рабочее дерево не трогается вовсе — ни индекс, ни
# незакоммиченное, ни stash.
set -u
ROOT="${1:?нужен корень репозитория}"
shift
if [ $# -eq 0 ]; then
  echo 'tri vs-main <команда…>'
  echo 'пример: tri vs-main npx vitest run src/tests/unit/provider-registry.test.ts'
  echo
  echo 'Ответ на вопрос «падает ли это и без моих правок».'
  exit 2
fi
cd "$ROOT" || exit 1

git fetch -q origin main 2>/dev/null
WT="$(mktemp -d)/main"
cleanup() {
  git worktree remove --force "$WT" >/dev/null 2>&1
  rm -rf "$(dirname "$WT")"
}
trap cleanup EXIT

git worktree add -q --detach "$WT" origin/main || {
  echo "не удалось сделать копию на origin/main"; exit 2; }

# СИМЛИНКИ НА node_modules. Без них прогон падает «модуля нет», и это читается
# как «на main сломано» — то есть ровно тот ложный ответ, ради которого всё.
for d in node_modules \
         apps/vibee-editor/render/node_modules \
         apps/vibee-editor/packages/vibee-atoms/node_modules; do
  src="$ROOT/$d"
  [ -d "$src" ] && [ ! -e "$WT/$d" ] && mkdir -p "$(dirname "$WT/$d")" &&
    ln -s "$src" "$WT/$d"
done

echo "── на чистом origin/main ($(git rev-parse --short origin/main)) ──"
OUT="$(mktemp)"
( cd "$WT" && "$@" ) 2>&1 | tee "$OUT"
RC=${PIPESTATUS[0]}
echo

# КОМАНДА, КОТОРАЯ НИЧЕГО НЕ СДЕЛАЛА, — НЕ ОТВЕТ.
#
# Первый же прогон этой команды выдал «на main это тоже падает» на файле,
# который на main ЕСТЬ: vitest не подхватил путь и напечатал «no tests»,
# выйдя с единицей. Вердикт был вынесен по прогону, которого не было, —
# ровно та ошибка, ради которой команда и написана.
if grep -qiE 'no test (files )?found|no tests|нет тестов' "$OUT"; then
  echo "  🛑 НЕТ ВЕРДИКТА: команда ничего не выполнила («no tests»)."
  echo "     Файл на main может существовать, а прогон его не подхватить —"
  echo "     проверьте путь и конфиг, прежде чем считать это фоном."
  rm -f "$OUT"
  exit 2
fi
rm -f "$OUT"

if [ $RC -eq 0 ]; then
  echo "  ✅ на main это ПРОХОДИТ (код $RC) — значит дело в ваших правках"
else
  echo "  ⚠️  на main это тоже падает (код $RC) — фон, а не ваша правка"
fi
echo "  Рабочее дерево не тронуто: ни stash, ни reset, ни checkout."
exit $RC
