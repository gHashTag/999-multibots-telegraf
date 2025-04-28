#!/bin/bash

# Скрипт для запуска бота в режиме разработки с использованием Vite
# Обеспечивает быструю перезагрузку и HMR

echo "🚀 Запуск телеграм-бота в режиме разработки с Vite"

# Проверяем наличие FORCE_START=true в параметрах
FORCE_START=false
for arg in "$@"; do
  if [[ "$arg" == "force" ]]; then
    FORCE_START=true
    echo "⚠️ Принудительный запуск активирован (FORCE_START=true)"
    break
  fi
done

# Экспортируем переменную окружения FORCE_START
export FORCE_START=$FORCE_START

# Проверяем, есть ли уже запущенные процессы на портах
node scripts/kill-port.cjs 2999 3000 3001 8288

echo "🔍 Порты очищены и готовы к запуску"

# Выводим информацию о процессе запуска
echo "⚡ Запуск через Vite с HMR (Hot Module Replacement)"
echo "📂 Исходный код: src/bot.ts"
echo "⏱️ Время запуска: $(date '+%H:%M:%S')"

# Задаем переменные для лучшей работы Node.js с модулями
export NODE_OPTIONS="--experimental-specifier-resolution=node --no-warnings"
# Включаем ESM для лучшей совместимости
export USE_ESM=true
# Включаем отладочный вывод для диагностики проблем
export DEBUG=vite:*

# Запускаем Vite
pnpm dev

# Ожидаем завершения процесса
wait
echo "👋 Сервер разработки Vite завершил работу" 