#!/bin/bash

# Скрипт для очистки предыдущих процессов перед запуском pnpm dev

echo "Очистка предыдущих процессов бота..."
pkill -f 'ts-node-dev.*src/bot.ts'
echo "Процессы завершены."

# Установка переменных окружения для режима разработки
echo "Запуск pnpm dev с переменными окружения NODE_ENV=development и MODE=development..."
NODE_ENV=development MODE=development pnpm dev 