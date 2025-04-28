# Этап сборки
FROM node:20-alpine as builder

WORKDIR /app

COPY package*.json ./
COPY bun.lockb ./
# Используем Bun для установки зависимостей
RUN bun install --frozen-lockfile

# Установка tsc-alias больше не нужна глобально
# RUN npm install -g tsc-alias

COPY . .

# Создаем временную конфигурацию TypeScript, которая исключает тестовые файлы
RUN cp tsconfig.json tsconfig.build.json && \
    sed -i 's/"include": \["src\/\*\*\/\*\.ts", "src\/\*\*\/\*\.json", "__tests__\/\*\*\/\*\.ts"\]/"include": \["src\/\*\*\/\*\.ts", "src\/\*\*\/\*\.json"\]/' tsconfig.build.json

# Выполняем сборку TypeScript с пропуском проверки типов для решения проблем совместимости
# и обрабатываем алиасы путей с помощью tsc-alias (включено в скрипт build:nocheck)
RUN npx tsc --skipLibCheck --skipDefaultLibCheck --project tsconfig.build.json && npx tsc-alias --project tsconfig.build.json

# Проверяем, что файлы сборки созданы
RUN ls -la dist/ || echo "Директория dist не существует или пуста"

# Финальный этап
FROM node:20-alpine

WORKDIR /app

# Устанавливаем только необходимые системные зависимости
RUN apk add --no-cache \
    openssh-client \
    sshpass

# Создаем нужные каталоги внутри рабочей директории и устанавливаем права
RUN mkdir -p /app/.ssh && chmod 700 /app/.ssh && chown -R node:node /app/.ssh

# Копируем файлы package.json и package-lock.json
COPY package*.json ./
COPY bun.lockb ./

# При установке пропускаем скрипт prepare, который запускает husky install
# Используем Bun для установки только production зависимостей
RUN bun install --production --frozen-lockfile

# Копируем только собранные файлы из этапа сборки
COPY --from=builder /app/dist ./dist/

# Проверяем, что файлы сборки скопированы
RUN ls -la dist/ || echo "Директория dist не существует или пуста"

# Пытаемся скопировать .env файл если он существует
COPY .env ./
# Копируем остальные .env.* файлы, если они есть
COPY .env.* ./

# Создаем пустой .env файл на всякий случай (entrypoint его наполнит, если нужно)
RUN touch .env

# Копируем entrypoint скрипт
COPY scripts/docker-entrypoint.sh ./
RUN chmod +x /app/docker-entrypoint.sh

# Копируем файл конфигурации PM2
COPY ecosystem.config.cjs ./

# Экспортируем порт для API и боты
EXPOSE 3000 3001 3002 3003 3004 3005 3006 3007 2999

# Используем наш entrypoint скрипт для подготовки окружения
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Запускаем приложение через pm2-runtime
CMD ["pm2-runtime", "start", "ecosystem.config.cjs", "--env", "production"]