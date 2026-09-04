#!/bin/bash
# Освободить место под сборку. Только РЕГЕНЕРИРУЕМОЕ.
#
# ПОЧЕМУ ЭТОТ СКРИПТ ВООБЩЕ ЕСТЬ. Диск на этой машине упирается в ноль каждые
# несколько сборок, и цикл вставал именно на этом — не на задаче. Чистка руками
# по три раза за смену съедала время, которое должно идти в работу.
#
# ЧЕГО ЭТОТ СКРИПТ НЕ ДЕЛАЕТ И НЕ ДОЛЖЕН.
#   ~/Movies, ~/Documents, ~/Downloads, ~/Library/Containers — файлы человека и
#   данные приложений. Удалить их «ради места» нельзя: восстановить неоткуда.
#   dist ВНУТРИ node_modules — это файлы пакетов, а не наша сборка. Снести их
#   значит сломать зависимости, а выглядит как безобидная чистка мусора.
set -u

до=$(df -k /System/Volumes/Data | awk 'NR==2{print $4}')

# 1. Кэши сборки: пересоздаются сами при следующем запуске.
rm -rf ~/Library/Developer/Xcode/DerivedData/* 2>/dev/null
rm -rf ~/Library/Developer/Xcode/Archives/* 2>/dev/null
rm -rf ~/Library/Caches/* 2>/dev/null
rm -rf ~/.npm/_cacache 2>/dev/null

# 2. Наши сборочные выходы — но НЕ те, что лежат в node_modules (см. выше).
for корень in ~/999-multibots-telegraf ~/t27 ~/.vibee-worktrees; do
  [ -d "$корень" ] || continue
  find "$корень" -maxdepth 4 -type d \
    \( -name dist -o -name .next -o -name .turbo -o -name build-dev \) \
    -not -path '*/node_modules/*' -prune -exec rm -rf {} + 2>/dev/null
done

# 3. Симуляторы НЕ трогаем.
#
# Здесь стояло `xcrun simctl delete unavailable`, и оно снесло устройство, на
# котором шла вся проверка приложения: «unavailable» у simctl означает не
# «мусор», а «рантайм сейчас не подхватился» — состояние временное, а удаление
# окончательное. Следующая сборка упала с «Unable to find a device matching the
# provided destination», и восстановление стоило дороже, чем освобождённые
# мегабайты.
#
# Место освобождает `~/Library/Developer/CoreSimulator/Caches` выше — он
# пересоздаётся сам и устройств не касается.

# 4. Докер, если он тут есть.
command -v docker >/dev/null && docker system prune -af --volumes 2>/dev/null | tail -1

после=$(df -k /System/Volumes/Data | awk 'NR==2{print $4}')
echo "освобождено: $(( (после - до) / 1024 )) МБ · свободно: $(( после / 1024 )) МБ"

# Порог осмысленной сборки. Ниже — чинить нечем, нужны файлы человека.
if [ "$после" -lt 2097152 ]; then
  echo "МАЛО МЕСТА: под сборку нужно ~2 ГБ. Регенерируемое кончилось —"
  echo "остальное принадлежит человеку (~/Movies, ~/Library/Containers)."
  exit 1
fi
