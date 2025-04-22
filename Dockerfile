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
FROM node:20-alpine AS builder

RUN echo "---> Starting Builder Stage..."

# Устанавливаем pnpm
RUN npm install -g pnpm

WORKDIR /app

# Копируем package.json и pnpm-lock.yaml (если есть)
COPY package*.json pnpm-lock.yaml* ./

# Устанавливаем все зависимости (включая dev) с помощью pnpm
RUN echo "---> Running pnpm install (builder dependencies)..."
RUN pnpm install

# Копируем остальной исходный код
RUN echo "---> Copying source code..."
COPY . .
RUN echo "---> Checking Git commit hash inside builder stage:" && (git log -1 --pretty=%H || echo "Git not available or repo not fully copied yet")

# Запускаем сборку с помощью pnpm
RUN echo "---> Running build script (pnpm build)..."
RUN pnpm build

# Финальный этап
FROM node:20-alpine AS final

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

# Копируем package.json и pnpm-lock.yaml (если есть)
COPY package*.json pnpm-lock.yaml* ./

# Устанавливаем только production зависимости с помощью pnpm
RUN echo "---> Running pnpm install (production dependencies)..."
RUN pnpm install --prod --ignore-scripts

# Копируем собранные артефакты из builder stage
RUN echo "---> Copying built artifacts from builder stage..."
COPY --from=builder /app/dist ./dist

# Экспортируем порт для API и боты
EXPOSE 3000 3001 3002 3003 3004 3005 3006 3007 2999

CMD ["node", "dist/bot.js"]