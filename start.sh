#!/bin/sh

# Запускаем сервер в фоновом режиме
node -r tsconfig-paths/register dist/server.js &

# Запускаем бота
node -r tsconfig-paths/register dist/bot.js 