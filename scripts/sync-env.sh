#!/bin/bash

# 🔄 ENV SYNC - Smart Environment Synchronization
# Автоматически определяет источник .env файла и синхронизирует

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
WORKTREE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MAIN_REPO_DIR="/Users/playra/999-agents-telegraf"

# Если есть новый скрипт синхронизации worktree - используем его
if [ -f "$SCRIPT_DIR/worktree-env-sync.sh" ]; then
    exec "$SCRIPT_DIR/worktree-env-sync.sh" "$@"
    exit $?
fi

# Fallback логика для обычной синхронизации
# Проверяем существование .env файла
if [ ! -f "$WORKTREE_DIR/.env" ]; then
    # Пробуем скопировать из основного репозитория
    if [ -f "$MAIN_REPO_DIR/.env" ]; then
        cp "$MAIN_REPO_DIR/.env" "$WORKTREE_DIR/.env"
        echo "✅ Copied .env from main repository"
    # Если .env не существует, но есть .env.example - копируем его
    elif [ -f "$WORKTREE_DIR/.env.example" ]; then
        cp "$WORKTREE_DIR/.env.example" "$WORKTREE_DIR/.env"
        echo "Created .env from .env.example"
    else
        echo "Error: Neither .env nor .env.example exists"
        exit 1
    fi
else
    echo "✅ .env file already exists"
fi

# Делаем скрипт исполняемым
chmod +x "$0"
