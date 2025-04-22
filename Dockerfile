# Этап сборки
FROM node:20-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm install

# Убедимся, что tsc-alias установлен глобально для сборки
RUN npm install -g tsc-alias

COPY . .

# Выполняем сборку TypeScript с пропуском проверки типов для решения проблем совместимости
# и обрабатываем алиасы путей с помощью tsc-alias (включено в скрипт build:nocheck)
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

# Создаем нужные каталоги внутри рабочей директории и устанавливаем права
RUN mkdir -p /app/.ssh && chmod 700 /app/.ssh && chown -R node:node /app/.ssh

COPY package*.json ./
# При установке пропускаем скрипт prepare, который запускает husky install
RUN npm install --omit=dev --ignore-scripts

# Копируем только необходимые файлы из этапа сборки
COPY --from=builder /app/dist ./dist

# Экспортируем порт для API и боты
EXPOSE 3000 3001 3002 3003 3004 3005 3006 3007 2999

CMD ["node", "dist/bot.js"]