# Этап сборки
FROM node:20-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .

# Выполняем сборку TypeScript
RUN npm run build

# Финальный этап
FROM node:20-alpine

# Устанавливаем зависимости для Ansible
RUN apk add --no-cache \
    python3 \
    py3-pip \
    openssh-client \
    sshpass \
    nginx

# Создаем виртуальное окружение и устанавливаем Ansible
RUN python3 -m venv /opt/ansible-venv \
    && . /opt/ansible-venv/bin/activate \
    && pip install --no-cache-dir ansible

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts --omit=dev

# Копируем только необходимые файлы из этапа сборки
COPY --from=builder /app/dist ./dist

# Экспортируем порт для API и боты
EXPOSE 3000 3001 3002 3003 3004 3005 3006 3007 2999

CMD ["node", "dist/bot.js"]