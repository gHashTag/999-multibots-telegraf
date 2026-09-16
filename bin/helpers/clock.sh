#!/bin/bash
# tri clock <дней> — прогнать тесты так, будто прошло N дней.
#
# ЗАЧЕМ (форма 33). Фикстура с календарной датой внутри окна — обратный
# отсчёт: тест зелен сегодня и красен через неделю. Одна такая дата
# 16.09.2026 сделала main красным и заблокировала push ВСЕМ, потому что
# `vitest related` тянет её по графу импортов.
#
# Найти остальные заранее можно ровно так: сдвинуть «сейчас» и посмотреть,
# что упало. Ничего не меняется на диске — сдвиг живёт в одном setup-файле
# и только на время прогона.
set -u
ROOT="${1:?нужен корень репозитория}"
DAYS="${2:-90}"
cd "$ROOT" || exit 1

SETUP="$ROOT/bin/helpers/clock/shift-now.mjs"
R="apps/vibee-editor/render"
CFG="$R/vitest.clock.mts"
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

echo "── прогон рендера так, будто прошло $DAYS дней ──"
( cd "$R" && CLOCK_SHIFT_DAYS="$DAYS" npx vitest run --config vitest.clock.mts --reporter=dot 2>&1 |
  grep -E "FAIL|Tests |Test Files " | head -40 )
rm -f "$CFG"
echo
echo "  Упавшее здесь — не сломанный код, а тесты, которые сгниют сами."
echo "  Чинить: даты — смещения от now, посчитанные ОДИН раз (форма 33)."
