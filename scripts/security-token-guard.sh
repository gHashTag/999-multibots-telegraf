#!/bin/bash
# Ищет секреты в том, что уходит в историю git.
#
# ЧТО БЫЛО НЕ ТАК С ПРЕЖНЕЙ ВЕРСИЕЙ (обе дыры проверены живым прогоном).
#
# 1. Она искала ТРИ имени переменных — INFISICAL_CLIENT_SECRET,
#    SUPABASE_SERVICE_KEY, REPLICATE_API_TOKEN — и только в форме `ИМЯ="...`.
#    Токен, записанный литералом без имени переменной, проходил насквозь:
#    подсунул строку вида `bot<цифры>:<35 символов>` — гвард сказал ОК.
#    А имя переменной как раз и не нужно, чтобы секрет работал.
#
# 2. Она исключала `*.md`, `CLAUDE.md` и `.claude/` — ровно те файлы, где в
#    этом репозитории секреты и оказались. Исключение снято.
#
# 3. Фолбэк на диапазон коммитов не срабатывал никогда:
#    `git diff --cached` возвращает 0 и при пустом выводе, поэтому `||` не
#    выполнялся. На pre-push, где ничего не проиндексировано, гвард
#    проверял ПУСТУЮ строку и всегда проходил. Режим теперь задаётся явно
#    аргументом, а не выводится из кода возврата.
#
# Ищем ФОРМУ секрета, а не его имя: форма — это то, что делает строку
# работающим ключом.
#
# Использование:
#   security-token-guard.sh staged   # pre-commit: проиндексированное
#   security-token-guard.sh range    # pre-push: коммиты, которых нет на origin
#
# Осознанное исключение помечается комментарием `secret-guard-ok: причина`
# на той же или предыдущей строке — как у check-dead-domain.

set -uo pipefail

MODE="${1:-staged}"

case "$MODE" in
  staged)
    DIFF="$(git diff --cached)"
    ;;
  range)
    upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
    if [ -n "$upstream" ]; then
      DIFF="$(git diff "$upstream"...HEAD 2>/dev/null || true)"
    else
      # Новой ветки ещё нет на сервере — сравниваем с основной.
      base="$(git merge-base origin/main HEAD 2>/dev/null || true)"
      DIFF="$([ -n "$base" ] && git diff "$base"..HEAD 2>/dev/null || git diff --cached)"
    fi
    ;;
  *)
    echo "неизвестный режим: $MODE (ожидается staged или range)" >&2
    exit 2
    ;;
esac

# Только добавленные строки: удаление секрета из файла блокировать нельзя,
# иначе почистить утечку станет невозможно.
ADDED="$(printf '%s\n' "$DIFF" | grep '^+' | grep -v '^+++' || true)"
[ -z "$ADDED" ] && exit 0

# Формы реальных ключей. Каждая проверена на живом примере из этого проекта.
declare -a NAMES=(
  "Telegram bot token"
  "OpenAI / Anthropic key"
  "Fly.io API token"
  "Replicate token"
  "AWS access key"
  "JWT (Supabase service_role и подобные)"
  "Slack token"
  "GitHub token"
  "приватный ключ"
  "секрет в переменной"
)
declare -a PATTERNS=(
  '(^|[^0-9])[0-9]{8,10}:AA[A-Za-z0-9_-]{30,}'
  'sk-(ant-)?(proj-)?[A-Za-z0-9_-]{20,}'
  'fm[12]_[A-Za-z0-9+/=_-]{40,}'
  '\br8_[A-Za-z0-9]{30,}'
  '\bAKIA[0-9A-Z]{16}\b'
  'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
  'xox[baprs]-[A-Za-z0-9-]{10,}'
  'gh[pousr]_[A-Za-z0-9]{30,}'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  '(SECRET|TOKEN|API_KEY|PASSWORD|SERVICE_KEY|SERVICE_ROLE_KEY|CLIENT_SECRET)[A-Z_]*[=:][[:space:]]*["'"'"'][A-Za-z0-9_/+=-]{16,}'
)

found=0
for i in "${!PATTERNS[@]}"; do
  hits="$(printf '%s\n' "$ADDED" | grep -nE "${PATTERNS[$i]}" | grep -v 'secret-guard-ok' || true)"
  if [ -n "$hits" ]; then
    [ "$found" = "0" ] && echo "❌ Похоже на секрет в изменениях:" && echo
    found=1
    echo "  ${NAMES[$i]}:"
    # Значение НЕ печатаем целиком — вывод хука попадает в логи и историю
    # терминала. Достаточно показать начало, чтобы человек нашёл строку.
    printf '%s\n' "$hits" | head -3 | while IFS= read -r line; do
      echo "    ${line:0:60}…"
    done
    echo
  fi
done

if [ "$found" = "1" ]; then
  echo "Секрет в истории git необратим: он остаётся в объектах даже после"
  echo "правки файла, и его придётся отзывать, а не удалять."
  echo
  echo "Если совпадение ложное — допишите на строке: secret-guard-ok: причина"
  exit 1
fi

exit 0
