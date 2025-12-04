#!/bin/bash

echo "🔧 ИСПРАВЛЯЕМ ВСЕ levels[104] БЕЗ FALLBACK..."

# Находим все файлы с levels[104] и заменяем на fallback
find src -name "*.ts" -type f ! -name "*.test.ts" -exec grep -l "levels\[104\]\.title_ru" {} \; | while read file; do
  echo "✅ Исправляем: $file"

  # Заменяем levels[104].title_ru на fallback
  sed -i '' 's/levels\[104\]\.title_ru/(levels?.\[104\]?.title_ru || '\''🏠 Главное меню'\'')/g' "$file"

  # Заменяем levels[104].title_en на fallback
  sed -i '' 's/levels\[104\]\.title_en/(levels?.\[104\]?.title_en || '\''🏠 Main menu'\'')/g' "$file"
done

echo "✅ ГОТОВО! Все levels[104] теперь имеют fallback"
