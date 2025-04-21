# Этап сборки
FROM node:20-alpine as builder

WORKDIR /app

# Копируем файлы package.json и package-lock.json
COPY package*.json ./
RUN npm install

# Копируем исходный код и конфигурационные файлы
COPY . .
COPY .env .env

# Выполняем сборку TypeScript
RUN npm run build:nocheck

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

# Создаем нужные каталоги и устанавливаем права
RUN mkdir -p /app/.ssh && chmod 700 /app/.ssh && chown -R node:node /app/.ssh

# Копируем package.json и устанавливаем production зависимости
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

# Копируем собранные файлы и .env из этапа сборки
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.env ./.env

# Создаем директории для логов и загрузок
RUN mkdir -p /app/logs /app/uploads \
    && chown -R node:node /app/logs /app/uploads

# Экспортируем порты
EXPOSE 3000 3001 3002 3003 3004 3005 3006 3007 2999

# Переключаемся на пользователя node для безопасности
USER node

CMD ["node", "dist/bot.js"]