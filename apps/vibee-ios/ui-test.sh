#!/usr/bin/env bash
#
# Прогон UI-тестов вкладки «ИИ» одной командой.
#
# ЗАЧЕМ СКРИПТ, А НЕ СТРОКА В ДОКУМЕНТАЦИИ. Полная команда xcodebuild с
# назначением занимает две строки, требует udid симулятора и молча падает,
# если симулятора нет вовсе — а он пропадает: `xcrun simctl delete unavailable`
# и чистка диска сносят устройства без предупреждения. Здесь это обработано.
#
#   ./ui-test.sh                 — все тесты вкладки
#   ./ui-test.sh testЦенаВидна   — один тест по имени
#
set -euo pipefail
cd "$(dirname "$0")"

# Имена переменных латиницей: bash не принимает кириллицу в идентификаторах
# («СХЕМА=Vibee: command not found»), в отличие от Swift и TypeScript рядом.
SCHEME=Vibee
TARGET=VibeeUITests
CLASS=ИИЭкранTests

# Симулятор: берём первый загруженный, иначе первый доступный, иначе создаём.
udid=$(xcrun simctl list devices 2>/dev/null | grep -m1 "Booted" | grep -oE "[0-9A-F-]{36}" || true)
if [ -z "$udid" ]; then
  udid=$(xcrun simctl list devices available 2>/dev/null | grep -m1 "iPhone" | grep -oE "[0-9A-F-]{36}" || true)
fi
if [ -z "$udid" ]; then
  echo "Симуляторов нет — создаю."
  devtype=$(xcrun simctl list devicetypes | grep -m1 "iPhone 17 Pro (" | grep -oE "com\.apple[^)]*")
  runtime=$(xcrun simctl list runtimes | grep -m1 "iOS " | grep -oE "com\.apple\.CoreSimulator\.SimRuntime\.iOS-[0-9-]+")
  udid=$(xcrun simctl create "Vibee-UI" "$devtype" "$runtime")
fi
xcrun simctl boot "$udid" 2>/dev/null || true
echo "Симулятор: $udid"

xcodegen generate >/dev/null

filter=()
if [ $# -gt 0 ]; then filter=(-only-testing:"$TARGET/$CLASS/$1"); fi

# build-for-testing и test-without-building РАЗДЕЛЬНО: так повторный прогон
# без правок кода не пересобирает приложение и укладывается в полторы минуты
# вместо четырёх.
xcodebuild -project Vibee.xcodeproj -scheme "$SCHEME" \
  -destination "platform=iOS Simulator,id=$udid" \
  -configuration Debug build-for-testing 2>&1 | grep -E "error:|TEST BUILD" || true

xcodebuild -project Vibee.xcodeproj -scheme "$SCHEME" \
  -destination "platform=iOS Simulator,id=$udid" \
  -configuration Debug test-without-building "${filter[@]}" 2>&1 \
  | grep -E "Test Case.*(passed|failed|skipped)|Executed .* tests|error:" \
  | sed 's/-\[VibeeUITests\.ИИЭкранTests //; s/\]//'
