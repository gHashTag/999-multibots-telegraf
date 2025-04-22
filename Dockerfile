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

RUN echo "---> Starting Builder Stage..."

WORKDIR /app

COPY package*.json ./
RUN echo "---> Running npm install (builder dependencies)..."
RUN npm install

RUN echo "---> Copying source code..."
COPY . .
RUN echo "---> Checking Git commit hash inside builder stage:" && (git log -1 --pretty=%H || echo "Git not available or repo not fully copied yet")

# Выполняем сборку TypeScript с пропуском проверки типов для решения проблем совместимости
# и обрабатываем алиасы путей с помощью tsc-alias (включено в скрипт build:nocheck)
RUN echo "---> Running build script (npm run build)..."
RUN npm run build

# Финальный этап
FROM node:20-alpine

RUN echo "---> Starting Final Stage..."

WORKDIR /app

# Удаляем зависимости для Ansible
# RUN apk add --no-cache \
#     python3 \
#     py3-pip \
#     openssh-client \
#     sshpass \
#     nginx

# Устанавливаем только nginx, если он нужен отдельно (или другие НЕ Python/Ansible зависимости)
RUN apk add --no-cache openssh-client sshpass nginx

# Создаем нужные каталоги внутри рабочей директории и устанавливаем права
# RUN mkdir -p /app/.ssh && chmod 700 /app/.ssh && chown -R node:node /app/.ssh
# Оставляем создание .ssh, если оно нужно для других целей
RUN mkdir -p /app/.ssh && chmod 700 /app/.ssh && chown -R node:node /app/.ssh

COPY package*.json ./
RUN echo "---> Running npm install (production dependencies)..."
RUN npm install --omit=dev --ignore-scripts

# Копируем только необходимые файлы из этапа сборки
RUN echo "---> Copying built artifacts from builder stage..."
COPY --from=builder /app/dist ./dist

# Экспортируем порт для API и боты
EXPOSE 3000 3001 3002 3003 3004 3005 3006 3007 2999

CMD ["node", "dist/bot.js"]