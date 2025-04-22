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
# Этап сборки
FROM node:20-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Выполняем сборку TypeScript с пропуском проверки типов для решения проблем совместимости
# и обрабатываем алиасы путей с помощью tsc-alias (включено в скрипт build:nocheck)
RUN npm run build

# Финальный этап
FROM node:20-alpine

WORKDIR /app

# Устанавливаем зависимости для Ansible
RUN apk add --no-cache \
    python3 \
    py3-pip \
    openssh-client \
    sshpass \
    nginx

# Создаем виртуальное окружение и устанавливаем Ansible
RUN python3 -m venv /app/ansible-venv \
    && . /app/ansible-venv/bin/activate \
    && pip install --no-cache-dir ansible

# Создаем нужные каталоги внутри рабочей директории и устанавливаем права
RUN mkdir -p /app/.ssh && chmod 700 /app/.ssh && chown -R node:node /app/.ssh

COPY package*.json ./
RUN npm install --omit=dev

# Копируем только необходимые файлы из этапа сборки
COPY --from=builder /app/dist ./dist

# Экспортируем порт для API и боты
EXPOSE 3000 3001 3002 3003 3004 3005 3006 3007 2999

CMD ["node", "dist/bot.js"]