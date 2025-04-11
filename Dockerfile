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
RUN npm install --omit=dev

# Копируем только необходимые файлы из этапа сборки
COPY --from=builder /app/dist ./dist

# Исправляем пути импорта внутри контейнера (Alpine Linux)
RUN echo "🔧 Fixing import paths in dist directory..." && \
    find dist -type f -name "*.js" -exec sed -i 's|\\.\\./src/|../|g' {} + && \
    echo "✅ Import paths fixed."

# Экспортируем порт для API и боты
EXPOSE 3000 3001 3002 3003 3004 3005 3006 3007 2999

CMD ["node", "dist/bot.js"]