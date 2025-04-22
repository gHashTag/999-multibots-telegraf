# ⛔️ ВНИМАНИЕ! КРИТИЧЕСКИ ВАЖНЫЕ НАСТРОЙКИ DOCKERFILE! ⛔️
#
# ********************************************************
# *                   !!!СТОП!!!                          *
# *        НЕ МЕНЯТЬ СЛЕДУЮЩИЕ НАСТРОЙКИ:                 *
# *                                                       *
# * 1. Использование npm (НЕ менять на pnpm/yarn)         *
# * 2. Порядок копирования файлов и сборки                *
# * 3. Права доступа и пользователя                       *
# * 4. Healthcheck настройки                              *
# *                                                       *
# * ПОСЛЕДСТВИЯ ИЗМЕНЕНИЙ:                               *
# * - Сломается сборка проекта                           *
# * - Проблемы с правами доступа                         *
# * - Нарушение безопасности                             *
# *                                                       *
# * ЕСЛИ НУЖНЫ ИЗМЕНЕНИЯ:                                *
# * 1. Сделать бэкап этого файла                         *
# * 2. Проконсультироваться с тимлидом                   *
# * 3. Тестировать на staging                            *
# ********************************************************
#
# LAST WORKING UPDATE: 21.04.2025
# TESTED BY: @playra
# Этап сборки
FROM node:20-alpine as builder

# Устанавливаем pnpm
RUN npm install -g pnpm

WORKDIR /app

# Копируем файлы для установки зависимостей
COPY package.json pnpm-lock.yaml ./

# Отключаем husky при установке
ENV HUSKY=0
RUN pnpm install

# Копируем исходный код
COPY . .

# Выполняем сборку TypeScript
RUN pnpm run build:prod

# Проверяем, что файлы собрались
RUN ls -la dist/

# Финальный этап
FROM node:20-alpine as stage-1

# Устанавливаем необходимые пакеты
RUN apk add --no-cache \
    python3 \
    py3-pip \
    openssh-client \
    sshpass \
    nginx

# Создаем необходимые директории
RUN mkdir -p /app/.ssh /app/logs /app/uploads /app/tmp \
    && chmod 700 /app/.ssh \
    && chown -R node:node /app

WORKDIR /app

COPY package.prod.json ./package.json
COPY pnpm-lock.yaml ./

# Отключаем husky при установке
ENV HUSKY=0
RUN pnpm install --prod

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/views ./src/views

USER node

# Экспортируем порты
EXPOSE 3000 3001 3002 3003 3004 3005 3006 3007 2999

# Запускаем приложение с правильным путем к конфигу
CMD ["node", "dist/bot.js"]