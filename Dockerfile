# Этап сборки
FROM node:20-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Выполняем сборку TypeScript
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
RUN python3 -m venv /opt/ansible-venv \
    && . /opt/ansible-venv/bin/activate \
    && pip install --no-cache-dir ansible

COPY package*.json ./
RUN npm install --production

# Копируем только необходимые файлы из этапа сборки
COPY --from=builder /app/dist ./dist


EXPOSE 3000

CMD ["node", "dist/bot.js"]