#!/bin/bash
# tri clock [дней] [render|bot|all] — прогнать тесты так, будто прошло N дней.
#
# ЗАЧЕМ (форма 33). Фикстура с календарной датой внутри окна — обратный
# отсчёт: тест зелен сегодня и красен через неделю. Одна такая дата
# 16.09.2026 сделала main красным и заблокировала push ВСЕМ, потому что
# `vitest related` тянет её по графу импортов.
#
# Найти остальные заранее можно ровно так: сдвинуть «сейчас» и посмотреть,
# что упало. Ничего не меняется на диске — сдвиг живёт в одном setup-файле
# и только на время прогона.
#
# ДВА ПРОГОНА, А НЕ ОДИН. Первая версия показывала список упавших под
# сдвигом и называла его находкой. В дереве рендера это работало, потому что
# там всё зелено. В дереве БОТА на main красны четыре файла ВСЕГДА — и тот же
# приём выдал бы их за «гниющие тесты». Разница между двумя списками — вот
# единственная честная находка; фон вычитается, а не пересказывается.
#
# Замер 16.09.2026: бот — 6815 тестов, 4 красных и до сдвига, и после.
# В дереве бота не гниёт ничего. Это ответ, который стоил второго прогона.
set -u
ROOT="${1:?нужен корень репозитория}"
DAYS="${2:-90}"
TREE="${3:-render}"
cd "$ROOT" || exit 1

case "$TREE" in
  render | bot | all) ;;
  *)
    echo "tri clock [дней] [render|bot|all]"
    echo "  render — сервис рендера (быстро, ~25 с)"
    echo "  bot    — дерево бота (~3 мин: два полных прогона)"
    echo "  all    — оба"
    exit 2
    ;;
esac

SETUP="$ROOT/bin/helpers/clock/shift-now.mjs"
[ -f "$SETUP" ] || { echo "нет файла сдвига: $SETUP"; exit 2; }

TMP="$(mktemp -d)"
CONFIGS=""
cleanup() {
  for c in $CONFIGS; do rm -f "$c"; done
  rm -rf "$TMP"
}
trap cleanup EXIT

# ДАТУ БЕРЁМ КОМАНДОЙ, А НЕ ИЗ ГОЛОВЫ. Однажды я посчитал «сколько прошло»
# от даты, которую помнил, и объявил память CRM мёртвой 32 часа; `date -u`
# показал час. Число, которое можно спросить у машины, не угадывают.
NOW="$(date -u +%Y-%m-%d)"
THEN="$(node -e "const d=new Date(Date.now()+$DAYS*86400000);console.log(d.toISOString().slice(0,10))")"

# Список упавших ФАЙЛОВ из прогона: только имена, отсортированы, без счётчиков.
# Сравнивать надо множества, а не текст вывода — в нём меняются тайминги.
fails_of() { grep -E '^ ?FAIL ' "$1" | awk '{print $2}' | sort -u; }

# run_tree <имя> <каталог> <аргументы vitest...>
run_tree() {
  local label="$1" dir="$2" cfg="$3"
  local base="$TMP/$label.base" shifted="$TMP/$label.shift"

  echo "── $label: прогон КАК СЕЙЧАС ($NOW) ──"
  ( cd "$dir" && CLOCK_SHIFT_DAYS=0 npx vitest run --config "$cfg" --reporter=dot 2>&1 ) > "$base"
  grep -E '^ *(Test Files|Tests) ' "$base" | sed 's/^/  /'

  echo "── $label: прогон так, будто уже $THEN (+$DAYS дней) ──"
  ( cd "$dir" && CLOCK_SHIFT_DAYS="$DAYS" npx vitest run --config "$cfg" --reporter=dot 2>&1 ) > "$shifted"
  grep -E '^ *(Test Files|Tests) ' "$shifted" | sed 's/^/  /'

  local nbase nshift
  fails_of "$base" > "$TMP/$label.a"
  fails_of "$shifted" > "$TMP/$label.b"
  nbase=$(grep -c . < "$TMP/$label.a" || true)
  nshift=$(grep -c . < "$TMP/$label.b" || true)

  echo
  echo "  красных файлов сейчас: ${nbase:-0}; под сдвигом: ${nshift:-0}"
  if [ "${nbase:-0}" != "0" ]; then
    echo "  фон (красны и без сдвига — не находка, но и не норма):"
    sed 's/^/    · /' < "$TMP/$label.a"
  fi

  local new
  new=$(comm -13 "$TMP/$label.a" "$TMP/$label.b")
  if [ -z "$new" ]; then
    echo "  ✅ $label: под сдвигом НЕ падает ничего сверх фона — гниющих тестов нет."
    return 0
  fi
  echo
  echo "  🕰️  $label: СГНИЮТ К $THEN:"
  printf '%s\n' "$new" | sed 's/^/    · /'
  return 1
}

RC=0
if [ "$TREE" = "render" ] || [ "$TREE" = "all" ]; then
  R="apps/vibee-editor/render"
  CFG="$R/vitest.clock.mts"
  CONFIGS="$CONFIGS $ROOT/$CFG"
  cat > "$CFG" <<CFGEOF
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    globals: true,
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.spec.ts', 'e2e/**'],
    setupFiles: ['$SETUP'],
  },
})
CFGEOF
  run_tree "рендер" "$R" "vitest.clock.mts" || RC=1
  echo
fi

if [ "$TREE" = "bot" ] || [ "$TREE" = "all" ]; then
  # Корневой конфиг НЕ переписываем — наследуем. В нём тридцатисекундный
  # срок, словарь путей `@/…`, свой кеш и длинный список исключений; копия
  # всего этого разошлась бы с оригиналом на первой же правке и стала бы
  # мерить не тот набор.
  BCFG="vitest.clock.bot.mts"
  CONFIGS="$CONFIGS $ROOT/$BCFG"
  cat > "$BCFG" <<CFGEOF
import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vitest.config'

export default mergeConfig(
  base,
  defineConfig({ test: { setupFiles: ['$SETUP'] } })
)
CFGEOF
  run_tree "бот" "$ROOT" "$BCFG" || RC=1
  echo
fi

echo "  Упавшее сверх фона — не сломанный код, а тесты, которые сгниют сами."
echo "  Чинить: даты — смещения от now, посчитанные ОДИН раз (форма 33)."
exit $RC
