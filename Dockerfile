# Этап сборки
FROM node:20-alpine as builder

WORKDIR /app

COPY package*.json ./
# Устанавливаем все зависимости, включая dev для сборки
RUN npm install

COPY . .

# Выполняем сборку TypeScript с пропуском проверки типов для решения проблем совместимости
# и обрабатываем алиасы путей с помощью tsc-alias (включено в скрипт build:nocheck)
RUN npm run build:nocheck

# Финальный этап
FROM node:20-alpine as app

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
RUN mkdir -p /app/.ssh && chmod 700 /app/.ssh

# Копируем package.json и package-lock.json
COPY package*.json ./

# Убеждаемся, что tslib указан в dependencies, а не в devDependencies
RUN npm install --omit=dev && npm install --no-save tslib && npm list tslib

# Копируем только необходимые файлы из этапа сборки
COPY --from=builder /app/dist ./dist

# Копируем скрипт проверки tslib и полифил
COPY scripts/check-tslib.js ./scripts/check-tslib.js
RUN chmod +x ./scripts/check-tslib.js

# Создаем node_modules/tslib, если он не существует
RUN if [ ! -d "node_modules/tslib" ]; then mkdir -p node_modules/tslib && npm install --no-save tslib && cp -r /usr/local/lib/node_modules/tslib/* node_modules/tslib/ || true; fi

# Экспортируем порт для API и боты
EXPOSE 3000 3001 3002 3003 3004 3005 3006 3007 2999

# Запускаем скрипт проверки tslib перед запуском приложения
CMD ["sh", "-c", "node ./scripts/check-tslib.js && node dist/bot.js"]