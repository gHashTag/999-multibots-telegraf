#!/bin/bash
# Защита push: прямая ветка + перезапись истории.
#
# Перенесено из старого .husky/pre-push при переезде на lefthook. Проверка
# ценная и терять её нельзя: force push — запрет №0 в правилах репозитория,
# он стирает историю безвозвратно.
#
# ДВА СПОСОБА УЗНАТЬ, ЧТО PUSH ПЕРЕЗАПИСЫВАЕТ ИСТОРИЮ.
#
# Точный: git отдаёт pre-push хуку на stdin строки
# «local_ref local_sha remote_ref remote_sha» — по ним видно настоящее
# состояние удалённой ветки. Так делал старый хук.
#
# Запасной: сравнить HEAD с remote-tracking веткой. Нужен потому, что stdin
# у pre-push ровно один, а lefthook читает его сам, чтобы вычислить
# {push_files}. Если до нас ничего не дошло — работает запасной путь, иначе
# проверка молча превратилась бы в «всегда разрешаю».

set -uo pipefail

branch="$(git rev-parse --abbrev-ref HEAD)"

# 1. Прямой push в защищённую ветку.
if [ "$branch" = "main" ] || [ "$branch" = "production" ]; then
  echo "❌ Прямой push в '$branch' запрещён."
  echo
  echo "   git checkout -b feat/имя"
  echo "   git push -u origin feat/имя"
  echo "   gh pr create"
  exit 1
fi

ZERO=0000000000000000000000000000000000000000
rewrites=0
checked=0

# 2. Точный путь: читаем stdin, если он есть и не терминал.
if [ ! -t 0 ]; then
  while read -r local_ref local_sha remote_ref remote_sha; do
    [ -z "${local_sha:-}" ] && continue
    checked=1
    # Удаление ветки или создание новой — историю не переписывает.
    [ "$local_sha" = "$ZERO" ] && continue
    [ "${remote_sha:-$ZERO}" = "$ZERO" ] && continue
    # Если то, что сейчас на сервере, не является предком нашего HEAD, —
    # push сотрёт чужие коммиты.
    if ! git merge-base --is-ancestor "$remote_sha" "$local_sha" 2>/dev/null; then
      rewrites=1
    fi
  done
fi

# 3. Запасной путь: stdin не дошёл — сверяемся с remote-tracking веткой.
if [ "$checked" = "0" ]; then
  upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
  if [ -n "$upstream" ]; then
    if ! git merge-base --is-ancestor "$upstream" HEAD 2>/dev/null; then
      rewrites=1
      echo "   (проверено по $upstream — remote-tracking ветка может быть устаревшей)"
    fi
  fi
fi

if [ "$rewrites" = "1" ]; then
  echo "❌ Push переписывает историю (не fast-forward)."
  echo "   Force push стирает коммиты безвозвратно и ломает работу других."
  echo
  echo "   Вместо этого: новая ветка + pull request."
  exit 1
fi

exit 0
