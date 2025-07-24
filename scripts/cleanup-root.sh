#!/bin/bash

# 🕉️ Скрипт наведения порядка в корне проекта
# Дхарма: Порядок - основа процветания

echo "🧹 Начинаю наведение порядка в корне проекта..."

# 1. Архивация старых логов (старше 30 дней)
echo "📦 Архивирую старые логи..."
find logs/ -name "api-tests-2025*" -mtime +30 -type f -exec mv {} logs/archive/ \; 2>/dev/null || true

# 2. Очистка временных файлов
echo "🗑️ Очищаю временные файлы..."
find temp/ -name "*.tmp" -delete 2>/dev/null || true
find temp/ -name "*.cache" -delete 2>/dev/null || true

# 3. Очистка старых node_modules кэшей если есть
echo "💾 Очищаю кэши..."
rm -rf .temp_storage/.npm 2>/dev/null || true

# 4. Убираю .DS_Store файлы
echo "🍎 Убираю .DS_Store файлы..."
find . -name ".DS_Store" -delete 2>/dev/null || true

# 5. Создаю архивную папку для логов если не существует
mkdir -p logs/archive

# 6. Отчет
echo "✅ Порядок наведен!"
echo "📊 Статистика:"
echo "   - Логов: $(ls logs/ | wc -l)"
echo "   - Временных папок: $(ls temp/ | wc -l)"
echo "   - Размер logs/: $(du -sh logs/ | cut -f1)"

echo "🕉️ Ом Шанти. Порядок восстановлен." 