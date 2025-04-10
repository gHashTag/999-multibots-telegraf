FROM node:20-alpine

WORKDIR /app

# Копируем файлы package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости (пропуская husky)
RUN npm ci --omit=dev --ignore-scripts

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
CMD ["npm", "start"]