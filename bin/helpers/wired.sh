#!/bin/bash
# tri wired <имя> — зовёт ли кто-нибудь эту функцию из рабочего пути.
#
# ЗАЧЕМ. Самая дорогая ошибка последних смен повторилась ЧЕТЫРЕ раза и каждый
# раз выглядела безупречно: у правила десяток собственных тестов, все зелёные,
# мутации внутри правила убиваются — а вызова из рабочего кода нет вовсе.
#
#   noteReply        — девять тестов, вызов из mirrorNow удалён: все зелёные
#   обрыв витка      — пять тестов, signal не передан из routes: все зелёные
#   sendFileWith...  — 22 теста владеют путём, зеркало не вызывалось никогда
#   reverts_id       — колонка, индекс, фолд, тесты. Ни одного писателя
#
# Команда отвечает на один вопрос: кто зовёт это, кроме тестов и самого файла.
# Пусто — значит либо мёртвый код, либо фича, отключённая от вызывающего.
set -u

ROOT="${1:?нужен корень репозитория}"
NAME="${2:-}"
if [ -z "$NAME" ]; then
  echo 'tri wired <имя функции или символа>'
  echo 'пример: tri wired noteReply'
  exit 2
fi

cd "$ROOT" || exit 1

# Где объявлено: это не вызов, и из подсчёта его надо убрать.
DECL=$(grep -rn --include=\*.ts \
  -E "(export (async )?function|export const|function) +$NAME\b" \
  src apps 2>/dev/null | grep -v node_modules | head -5)

# Все упоминания, кроме объявления, тестов и самого объявляющего файла.
ALL=$(grep -rn --include=\*.ts "\b$NAME\b" src apps 2>/dev/null |
  grep -v node_modules || true)
TESTS=$(printf '%s\n' "$ALL" | grep -E '\.test\.ts|__tests__' | wc -l | tr -d ' ')
DECL_FILES=$(printf '%s\n' "$DECL" | cut -d: -f1 | sort -u)

CALLS=$(printf '%s\n' "$ALL" |
  grep -vE '\.test\.ts|__tests__' |
  grep -E "$NAME *\(" || true)
# Вызовы за пределами файлов, где символ объявлен.
OUTSIDE=""
while IFS= read -r line; do
  [ -z "$line" ] && continue
  f="${line%%:*}"
  skip=0
  for d in $DECL_FILES; do [ "$f" = "$d" ] && skip=1; done
  [ "$skip" = "0" ] && OUTSIDE="$OUTSIDE$line"$'\n'
done <<< "$CALLS"

echo "── объявлено ──"
[ -n "$DECL" ] && printf '%s\n' "$DECL" | sed 's/^/  /' || echo "  не найдено"
echo
echo "── зовут из рабочего пути ──"
N=$(printf '%s' "$OUTSIDE" | grep -c . || true)
if [ "${N:-0}" = "0" ]; then
  echo "  НИКТО."
  echo
  echo "  🛑 Либо мёртвый код, либо фича, отключённая от вызывающего."
  echo "     Тестов, упоминающих имя: $TESTS — и они ничего об этом не скажут."
  echo "     Проверить: tri mutate <файл вызывающего> \"<строка вызова>\" \"\" -- <тесты>"
  exit 1
fi
printf '%s' "$OUTSIDE" | sed 's/^/  /'
echo
echo "  вызовов вне объявляющего файла: $N; упоминаний в тестах: $TESTS"
