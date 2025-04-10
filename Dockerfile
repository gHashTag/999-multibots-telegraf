FROM node:20-alpine

WORKDIR /app

# Установка глобальных пакетов
RUN npm install -g tsx

# Копируем файлы package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости (включая рабочие и dev зависимости, но пропуская husky)
RUN npm ci --ignore-scripts

# Копируем исходный код приложения
COPY . .

# Создаем директорию для логов внутри контейнера
RUN mkdir -p /app/logs && \
    chmod -R 777 /app/logs

# Устанавливаем переменные окружения для production
ENV NODE_ENV=production
ENV LOG_DIR=/app/logs

# Экспонируем порты
EXPOSE 2999 3008

# Запускаем приложение
CMD ["npm", "run", "bots"]