#!/bin/sh
set -e

# Этот скрипт выполняется перед запуском основной команды контейнера (CMD).
# Мы больше не читаем .env здесь, так как переменные передаются через docker-compose environment.

echo "[Entrypoint] Starting container..."

# Проверка наличия node (опционально)
if ! command -v node > /dev/null; then
  echo "[Entrypoint] Error: node command not found!"
  exit 1
fi

echo "[Entrypoint] Environment seems ready."

# Запускаем команду, переданную в CMD Dockerfile (например, node dist/bot.js)
# "$@" передает все аргументы CMD
echo "[Entrypoint] Executing command: $@"
exec "$@"