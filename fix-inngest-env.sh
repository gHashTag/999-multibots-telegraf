#!/bin/bash

# Скрипт для исправления настроек Inngest в продакшене
# Корректная настройка для работы с Inngest

echo "🔧 Текущие настройки Inngest:"
grep "INNGEST_DEV\|INNGEST_BASE\|INNGEST_URL" .env

echo "🔄 Обновление настроек Inngest..."

# Заменяем или добавляем настройки
if grep -q "INNGEST_DEV" .env; then
  # Заменяем значение INNGEST_DEV
  sed -i 's/INNGEST_DEV=1/INNGEST_DEV=0/' .env
  sed -i 's/INNGEST_DEV=0/INNGEST_DEV=0/' .env # На всякий случай
else
  # Добавляем настройку INNGEST_DEV
  echo "INNGEST_DEV=0" >> .env
fi

# Устанавливаем правильный базовый URL
if grep -q "INNGEST_BASE_URL" .env; then
  # Заменяем значение INNGEST_BASE_URL
  sed -i 's|INNGEST_BASE_URL=.*|INNGEST_BASE_URL=https://api.inngest.com|' .env
else
  # Добавляем настройку INNGEST_BASE_URL
  echo "INNGEST_BASE_URL=https://api.inngest.com" >> .env
fi

# Устанавливаем правильный URL для Inngest
if grep -q "INNGEST_URL" .env; then
  # Заменяем значение INNGEST_URL
  sed -i 's|INNGEST_URL=.*|INNGEST_URL=https://api.inngest.com|' .env
else
  # Добавляем настройку INNGEST_URL
  echo "INNGEST_URL=https://api.inngest.com" >> .env
fi

echo "✅ Настройки Inngest успешно обновлены!"
echo "📋 Новые настройки:"
grep "INNGEST_DEV\|INNGEST_BASE\|INNGEST_URL" .env

echo "🔄 Для применения изменений выполните команду:"
echo "docker-compose down && docker-compose up -d" 