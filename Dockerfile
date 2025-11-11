# Этап сборки
FROM node:20-alpine as builder

WORKDIR /app
#
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Убедимся, что tsc-alias установлен глобально для сборки
RUN npm install -g tsc-alias

COPY . .

# Создаем временную конфигурацию TypeScript, которая исключает тестовые файлы
RUN cp tsconfig.json tsconfig.build.json && \
    sed -i 's/"include": \["src\/\*\*\/\*\.ts", "src\/\*\*\/\*\.json", "__tests__\/\*\*\/\*\.ts"\]/"include": \["src\/\*\*\/\*\.ts", "src\/\*\*\/\*\.json"\]/' tsconfig.build.json && \
    echo '{"extends": "./tsconfig.json", "exclude": ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**/*", "src/__tests__/**/*"]}' > tsconfig.build.json

# --- ВРЕМЕННОЕ ИСПРАВЛЕНИЕ: Удаляем ВСЕ тесты перед сборкой ---
RUN find src -name "__tests__" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find src -name "*.test.ts" -type f -delete 2>/dev/null || true && \
    find src -name "*.spec.ts" -type f -delete 2>/dev/null || true
# --------------------------------------------------------

# 🔥 КРИТИЧНО: Сборка TypeScript БЕЗ игнорирования ошибок
# Удалено "|| true" - если есть ошибки, сборка ДОЛЖНА упасть!
# Это предотвращает деплой сломанного кода в production
RUN npx tsc --project tsconfig.build.json && npx tsc-alias --project tsconfig.build.json || \
    (echo "❌ TypeScript compilation failed! Fix errors before deploy." && \
     echo "📋 Check build logs above for specific errors" && \
     exit 1)

# Проверяем, что файлы сборки созданы
RUN ls -la dist/ || echo "Директория dist не существует или пуста"

# Финальный этап
FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

# Устанавливаем только необходимые системные зависимости
RUN apk add --no-cache \
    openssh-client \
    sshpass \
    python3 \
    py3-pip \
    ffmpeg

# Устанавливаем yt-dlp для скачивания видео с дополнительными зависимостями
RUN pip3 install --break-system-packages yt-dlp[default] && \
    yt-dlp --version

# Создаем нужные каталоги внутри рабочей директории и устанавливаем права
RUN mkdir -p /app/.ssh && chmod 700 /app/.ssh && chown -R node:node /app/.ssh

# Копируем файлы package.json и package-lock.json
COPY package*.json ./

# При установке пропускаем скрипт prepare, который запускает husky install
RUN npm install --omit=dev --ignore-scripts --legacy-peer-deps

# Копируем только собранные файлы из этапа сборки
COPY --from=builder /app/dist ./dist/

# Проверяем, что файлы сборки скопированы
RUN ls -la dist/ || echo "Директория dist не существует или пуста"

# Копируем .env файл если он существует (опциональная копия)
# На production сервере .env уже есть и используется через docker run --env-file
COPY .env.example .env.example
RUN touch .env || true

# Создаём директорию для скриптов
RUN mkdir -p /app/scripts

# Копируем entrypoint скрипт (ВАЖНО!)
COPY scripts/docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Экспортируем порт для API и боты (+ 4000 для Inngest HTTP endpoint)
EXPOSE 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010 2999 4000

# Используем наш entrypoint скрипт для подготовки окружения
ENTRYPOINT ["/app/docker-entrypoint.sh"]