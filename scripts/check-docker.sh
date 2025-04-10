#!/bin/bash

# Эмодзи для логирования
INFO="ℹ️"
SUCCESS="✅"
ERROR="❌"
CHECK="🔍"

echo "${CHECK} Проверка установки Docker и docker-compose..."

# Проверка Docker
if ! command -v docker &> /dev/null; then
    echo "${ERROR} Docker не установлен"
    echo "${INFO} Установите Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# Проверка Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "${ERROR} Docker Compose не установлен"
    echo "${INFO} Установите Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

# Проверка статуса Docker демона
if ! docker info &> /dev/null; then
    echo "${ERROR} Docker демон не запущен"
    echo "${INFO} Запустите Docker демон и повторите попытку"
    exit 1
fi

# Проверяем версии
DOCKER_VERSION=$(docker --version)
COMPOSE_VERSION=$(docker-compose --version)

echo "${SUCCESS} Docker установлен: ${DOCKER_VERSION}"
echo "${SUCCESS} Docker Compose установлен: ${COMPOSE_VERSION}"
echo "${INFO} Система готова для запуска тестов в Docker"

exit 0 