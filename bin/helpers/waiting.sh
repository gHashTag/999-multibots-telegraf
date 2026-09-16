#!/bin/bash
# tri waiting — что лежит в открытом PR и ещё не в проде.
#
# ЗАЧЕМ. 16.09.2026 замер показал: в main НЕТ починки «одолженное соединение»
# (каждый платёж звёздами откатывался: деньги взяты, токены не пришли) и НЕТ
# починки «счёт гасится после зачисления», из-за которой тот платёж уже не
# починить повтором. Обе лежат в ветке 86 коммитов, потому что PR ждёт слова
# владельца — и это нормально: сливать без него нельзя.
#
# Ненормально другое: «86 коммитов» — не то, по чему принимают решение.
# Решение принимают по «что из этого трогает деньги и что видит клиент».
# Команда отвечает именно на это.
set -u
ROOT="${1:?нужен корень репозитория}"
cd "$ROOT" || exit 1

BASE="${2:-origin/main}"
git fetch origin main -q 2>/dev/null || true

N=$(git rev-list --count "$BASE"..HEAD 2>/dev/null || echo 0)
if [ "$N" = "0" ]; then
  echo "── ничего не ждёт: ветка не опережает $BASE ──"
  exit 0
fi

echo "── ждёт слияния: $N коммитов поверх $BASE ──"
echo

files() { git diff --name-only "$BASE"..HEAD; }

MONEY=$(files | grep -cE "token-ledger|token-invoice|stars-credit|paymentHandlers|billing" || true)
CLIENT=$(files | grep -cE "businessBotService|telegramProposals|tg-proposals|crm-replies|crmMenu|chat\.ts" || true)
TESTS=$(files | grep -cE "\.test\.ts" || true)
TOOLS=$(files | grep -cE "^bin/|^\.claude/" || true)

printf '  трогает деньги:      %s файл(ов)\n' "$MONEY"
printf '  видит клиент/владелец: %s\n' "$CLIENT"
printf '  тесты:               %s\n' "$TESTS"
printf '  инструменты и скилы: %s\n' "$TOOLS"
echo
echo "── починки, которых в проде ЕЩЁ НЕТ ──"
git log --oneline "$BASE"..HEAD | grep -E "^[0-9a-f]+ fix\(" | head -12 | sed 's/^/  /'
echo
echo "── новое поведение ──"
git log --oneline "$BASE"..HEAD | grep -E "^[0-9a-f]+ feat\(" | head -8 | sed 's/^/  /'
echo
echo "  Слияние — решение владельца. Здесь только список."
