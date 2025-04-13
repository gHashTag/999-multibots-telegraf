#!/bin/bash
# Запуск всех тестов для телеграм-сцен

# Установка корневой директории проекта для импортов
export NODE_PATH=../..

# Запуск тестов с помощью ts-node
npx ts-node -r tsconfig-paths/register runScenesTests.ts 