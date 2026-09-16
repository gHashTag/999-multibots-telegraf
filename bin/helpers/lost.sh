#!/bin/bash
# tri lost — коммиты, которые есть в reflog, но ни до одной ветки не достают.
#
# ЗАЧЕМ (форма 45). 16.09.2026 я сделал коммит, потом `git reset --hard
# origin/main`, потом два `git cherry-pick -q` — и оба молча не сработали:
# у `cherry-pick` НЕТ флага `-q`, а `2>&1 | tail -1` спрятал жалобу. HEAD уже
# уехал, работа осталась висеть без ветки. Нашлась в reflog за полминуты, но
# только потому, что я заметил: число тестов стало меньше, а не больше.
#
# Эта команда — сеть под тем же трюком: она перечисляет коммиты, до которых
# не дотягивается ни одна ветка, ни один тег, ни origin. Пусто — хорошо.
# Не пусто — либо мусор от rebase, либо чья-то потерянная смена.
set -u
ROOT="${1:?нужен корень репозитория}"
HOURS="${2:-24}"
cd "$ROOT" || exit 1

echo "── работа без ветки (reflog за $HOURS ч.) ──"

# Кандидаты: всё, что помнит reflog ЭТОЙ копии и всех её worktree.
CAND=$(mktemp); REACH=$(mktemp)

{
  git reflog --date=iso --format='%H' 2>/dev/null
  for d in $(git worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2}'); do
    git -C "$d" reflog --format='%H' 2>/dev/null
  done
} | sort -u > "$CAND"

# Достижимое: все ветки, теги, удалённые ветки и HEAD каждого worktree.
git rev-list --all --since="$HOURS hours ago" 2>/dev/null | sort -u > "$REACH"

# СЛИТОЕ СКВОШЕМ — НЕ ПОТЕРЯННОЕ.
#
# Первый прогон выдал двадцать коммитов девяти-тринадцатидневной давности:
# все они уехали в main сквошем, поэтому их исходные хеши ни в одной ветке
# не достижимы, а СОДЕРЖИМОЕ наверху. Список, где двадцать из двадцати —
# норма, читают один раз и перестают (та же ошибка, что «84 конфликта»).
# Сверяем по теме коммита: сквош её сохраняет.
SUBJ=$(mktemp)
trap 'rm -f "$CAND" "$REACH" "$SUBJ"' EXIT
# Темы ВСЕХ достижимых коммитов, а не только main: сегодняшняя работа живёт
# в ветках PR, и её копии после rebase иначе попали бы в «потерянное».
git log --all --format='%s' -n 800 2>/dev/null > "$SUBJ"

N=0
while IFS= read -r sha; do
  [ -z "$sha" ] && continue
  grep -qx "$sha" "$REACH" && continue
  # Дважды проверяем настоящей командой: rev-list мог не покрыть старое.
  if git merge-base --is-ancestor "$sha" HEAD 2>/dev/null; then continue; fi
  if [ -n "$(git branch -a --contains "$sha" 2>/dev/null)" ]; then continue; fi
  AGE=$(git log -1 --format='%cr' "$sha" 2>/dev/null) || continue
  SUB=$(git log -1 --format='%s' "$sha" 2>/dev/null)
  case "$AGE" in *year*|*month*|*week*|*day*) continue ;; esac
  # Тема уже наверху -- значит коммит слит (сквошем или иначе), не потерян.
  grep -qxF "$SUB" "$SUBJ" && continue
  N=$((N + 1))
  printf '  %s  %-16s %s\n' "$(git rev-parse --short "$sha")" "$AGE" "${SUB:0:70}"
  [ "$N" -ge 20 ] && { echo "  … показаны первые 20"; break; }
done < "$CAND"

echo
if [ "$N" = "0" ]; then
  echo "  ✅ ничего не потеряно: каждый коммит достаётся хотя бы одной веткой"
  exit 0
fi
echo "  🛑 $N коммит(ов) ни в одной ветке."
echo "     Часть — обычный мусор от rebase. Но если среди них ваша работа:"
echo "         git cherry-pick <хеш>        # вернуть на текущую ветку"
echo "         git show <хеш> | head -40    # посмотреть, что это было"
echo
echo "  И правило: НЕ делайте reset --hard, пока замена не легла. Проверяйте"
echo "  код возврата каждого шага — придуманный флаг (cherry-pick -q) молчит."
exit 1
