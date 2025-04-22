#!/bin/bash

# Скрипт для восстановления конфигурационных файлов
# из резервной копии (состояние коммита 9da4467).

SCRIPT_DIR=$(dirname "$0")
PROJECT_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
BACKUP_DIR="$PROJECT_ROOT/config_backup"

echo "🕉️  Восстановление конфигурационных файлов из $BACKUP_DIR..."

# Проверка существования резервной копии
if [ ! -d "$BACKUP_DIR" ]; then
  echo "❌ Ошибка: Каталог резервной копии $BACKUP_DIR не найден!" >&2
  exit 1
fi

# Файлы и каталоги для восстановления
FILES_TO_RESTORE=(
  "Dockerfile"
  "docker-compose.yml"
  "tsconfig.json"
  "package.json"
  "src/bot.ts"
  "src/config/index.ts"
)
DIRS_TO_RESTORE=(
  "nginx-config"
)

# Восстановление файлов
for file in "${FILES_TO_RESTORE[@]}"; do
  if [ -f "$BACKUP_DIR/$file" ]; then
    # Убедимся, что директория назначения существует
    DEST_DIR=$(dirname "$PROJECT_ROOT/$file")
    mkdir -p "$DEST_DIR"
    echo "    -> Восстановление файла $file..."
    cp "$BACKUP_DIR/$file" "$PROJECT_ROOT/$file"
  else
    echo "⚠️ Предупреждение: Файл $BACKUP_DIR/$file не найден в резервной копии." >&2
  fi
done

# Восстановление каталогов
for dir in "${DIRS_TO_RESTORE[@]}"; do
  if [ -d "$BACKUP_DIR/$dir" ]; then
    echo "    -> Восстановление каталога $dir..."
    # Удаляем существующий каталог в проекте перед копированием
    rm -rf "$PROJECT_ROOT/$dir"
    cp -R "$BACKUP_DIR/$dir" "$PROJECT_ROOT/$dir"
  else
    echo "⚠️ Предупреждение: Каталог $BACKUP_DIR/$dir не найден в резервной копии." >&2
  fi
done

echo "✅ Конфигурационные файлы и каталоги восстановлены до состояния коммита 9da4467."

exit 0 