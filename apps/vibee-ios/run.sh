#!/bin/bash
# Собрать, поставить и запустить на симуляторе — одной командой.
#
# ЗАЧЕМ. Цикл «правка → увидеть результат» состоял из четырёх команд, и
# каждая имела свой способ молча не сработать: xcodegen мог не перегенерить
# проект, xcodebuild — собрать в другой каталог, install — поставить старый
# .app, launch — поднять уже запущенный экземпляр со старым кодом. Дважды я
# смотрел на скриншот предыдущей сборки и делал выводы о новой.
#
#   ./run.sh            собрать и запустить
#   ./run.sh --shot     то же плюс скриншот в /tmp/vibee.png
#
# ГЛАВНАЯ ЛОВУШКА ЭТОЙ МАШИНЫ. Xcode несёт SDK iOS 26.5, а из рантаймов
# установлен только 18.4. Поэтому `xcodebuild -destination 'platform=iOS
# Simulator,...'` не находит НИ ОДНОГО симуляторного назначения и печатает
# «iOS 26.5 is not installed» про подключённый телефон. Сборка при этом
# возможна — но только целью и с явным SDK, минуя разрешение назначений.
# Отсюда форма команды ниже; не «упрощайте» её обратно на -scheme.

set -euo pipefail
cd "$(dirname "$0")"

# Имена переменных ЛАТИНИЦЕЙ: bash не принимает кириллицу в идентификаторах
# и падает на «command not found», не подсказывая, что дело в имени.
SIM="${VIBEE_SIM:-iPhone 16 Pro}"
BUNDLE="ai.t27.vibee"
SDK="$(xcodebuild -showsdks 2>/dev/null | grep -o 'iphonesimulator[0-9.]*' | head -1)"
[ -n "$SDK" ] || { echo "❌ не нашёл симуляторный SDK"; exit 1; }

# 1. Устройство. Загружаем, если спит: без этого install падает невнятно.
# `|| true` ОБЯЗАТЕЛЕН, и вот почему.
#
# При `set -e` + `pipefail` присваивание из неудачной подстановки роняет
# скрипт НА МЕСТЕ. `grep`, ничего не нашедший, возвращает 1 — значит при
# отсутствующем симуляторе скрипт умирал молча, ДО проверки ниже, и та
# проверка вместе со всем её объяснением была недостижима. Ровно это и
# случилось 07.09.2026: три попытки ушли на догадки о пустом выводе.
UDID="$(xcrun simctl list devices available \
  | grep -F "$SIM (" | head -1 | grep -oE '[0-9A-F-]{36}' || true)"
if [ -z "$UDID" ]; then
  # НАЗВАТЬ ПРИЧИНУ, А НЕ ТОЛЬКО ФАКТ. 07.09.2026 на этой машине не было НИ
  # ОДНОГО созданного устройства -- только рантайм. Сообщение «симулятор не
  # найден» звучало как опечатка в имени, и я потратил три попытки, прежде чем
  # посмотрел список. Пустой список -- отдельный случай, и говорить о нём надо
  # отдельно.
  echo "❌ симулятор «$SIM» не найден"
  DEVICES="$(xcrun simctl list devices available | grep -E '^ +[A-Za-z]' || true)"
  if [ -z "$DEVICES" ]; then
    RUNTIME="$(xcrun simctl list runtimes | grep -oE 'com\.apple\.CoreSimulator\.SimRuntime\.[A-Za-z0-9-]+' | head -1)"
    echo "   устройств не создано ВООБЩЕ. Создать:"
    echo "   xcrun simctl create '$SIM' \\"
    echo "     com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro \\"
    echo "     ${RUNTIME:-<рантайм из: xcrun simctl list runtimes>}"
  else
    echo "   есть такие:"
    echo "$DEVICES" | sed 's|^|   |'
  fi
  exit 1
fi

if ! xcrun simctl list devices | grep -F "$UDID" | grep -q Booted; then
  echo "▸ загружаю $SIM"
  xcrun simctl boot "$UDID"
  sleep 5
fi

# 2. Проект из project.yml. Всегда — иначе новый файл в каталоге просто не
#    попадёт в сборку, и правка «не подействует» без единой ошибки.
echo "▸ xcodegen"
xcodegen generate >/dev/null

# 3. Сборка. Цель + явный SDK, см. ловушку выше.
echo "▸ сборка ($SDK)"
if ! xcodebuild -project Vibee.xcodeproj -target Vibee \
      -sdk "$SDK" -configuration Debug -arch arm64 \
      SYMROOT="$PWD/build2" build > /tmp/vibee-build.log 2>&1; then
  echo "❌ сборка упала:"
  grep -E 'error:' /tmp/vibee-build.log | head -20
  # Одна ошибка стоит отдельной подсказки: она приходит от actool, говорит
  # про симуляторные рантаймы и НИКАК не намекает, что дело в иконке.
  # Появляется, если в project.yml включили «- AppIcon.xcassets», не
  # установив поддержку платформы.
  if grep -q 'No simulator runtime version' /tmp/vibee-build.log; then
    echo ""
    echo "   Это не про код: actool не может собрать иконку приложения."
    echo "   Либо установите платформу:  xcodebuild -downloadPlatform iOS"
    echo "   либо снова закомментируйте «- AppIcon.xcassets» в project.yml."
  fi
  exit 1
fi

APP="build2/Debug-iphonesimulator/Vibee.app"
[ -d "$APP" ] || { echo "❌ .app не собрался: $APP"; exit 1; }

# 4. Установка поверх ЗАВЕРШЁННОГО приложения. Живой экземпляр переживает
#    install и продолжает работать на старом коде — именно так я дважды
#    смотрел на прошлую сборку.
xcrun simctl terminate "$UDID" "$BUNDLE" >/dev/null 2>&1 || true
xcrun simctl install "$UDID" "$APP"
xcrun simctl launch "$UDID" "$BUNDLE" >/dev/null

echo "✅ запущено на $SIM"

if [ "${1:-}" = "--shot" ]; then
  # Пауза не косметическая: сразу после launch окно ещё пустое, и скриншот
  # покажет чёрный экран, который легко принять за поломку.
  sleep "${VIBEE_SHOT_DELAY:-6}"
  xcrun simctl io "$UDID" screenshot /tmp/vibee.png >/dev/null 2>&1
  echo "📸 /tmp/vibee.png"
fi
