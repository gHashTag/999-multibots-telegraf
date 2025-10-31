#!/bin/bash

# Проверяем существование .env файла
if [ ! -f .env ]; then
    # Если .env не существует, но есть .env.example - копируем его
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "Created .env from .env.example"
    else
        echo "Error: Neither .env nor .env.example exists"
        exit 1
    fi
fi

# Делаем скрипт исполняемым
chmod +x "$0"
