#!/bin/bash

# Скрипт для исправления настроек Inngest в продакшене
# Удаляет настройки для режима разработки

echo "🔧 Проверка текущих настроек Inngest..."
grep "INNGEST_DEV\|INNGEST_BASE" .env

echo "🔄 Обновление настроек Inngest..."

# Создаем временный файл
temp_file=".env.tmp"

# Обрабатываем файл .env
while IFS= read -r line
do
  # Пропускаем строки с INNGEST_DEV
  if [[ $line == *"INNGEST_DEV"* ]]; then
    echo "🗑️ Удаляем строку: $line"
    continue
  fi
  
  # Пропускаем строки с localhost в INNGEST_BASE_URL
  if [[ $line == *"INNGEST_BASE_URL"*"localhost"* ]]; then
    echo "🗑️ Удаляем локальный URL: $line"
    continue
  fi
  
  # Добавляем все остальные строки в временный файл
  echo "$line" >> "$temp_file"
done < .env

# Добавляем корректную настройку для продакшена
echo "" >> "$temp_file"
echo "# Production Inngest settings" >> "$temp_file"
echo "INNGEST_BASE_URL=https://api.inngest.com" >> "$temp_file"

# Заменяем оригинальный файл
mv "$temp_file" .env

echo "✅ Настройки Inngest успешно обновлены!"
echo "📋 Новые настройки:"
grep "INNGEST_\|host.docker" .env

echo "🔄 Для применения изменений необходимо перезапустить контейнер:"
echo "docker-compose down && docker-compose up -d" 