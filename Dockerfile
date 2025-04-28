# Этап сборки
FROM node:20-alpine as builder

# Устанавливаем curl и bash (нужны для установки bun)
RUN apk add --no-cache curl bash

# Устанавливаем bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

WORKDIR /app

COPY package*.json ./
# Используем Bun для установки зависимостей
RUN bun install

COPY . .

# Создаем временную конфигурацию TypeScript, которая исключает тестовые файлы
RUN cp tsconfig.json tsconfig.build.json && \
    sed -i 's/"include": \["src\/\*\*\/\*.ts", "src\/\*\*\/\*.json", "__tests__\/\*\*\/\*.ts"\]/"include": \["src\/\*\*\/\*.ts", "src\/\*\*\/\*.json"\]/' tsconfig.build.json

# Удаляем старую директорию dist перед сборкой
RUN rm -rf dist

# Выполняем сборку с помощью Vite (через bun run build)
RUN bun run build

# Проверяем, что файлы сборки созданы (ожидаем dist/index.js)
RUN ls -la dist/ || echo "Директория dist не существует или пуста"

# Финальный этап
FROM node:20-alpine

# Устанавливаем curl и bash (нужны для установки bun и других зависимостей)
RUN apk add --no-cache curl bash openssh-client sshpass

# Устанавливаем bun в финальном образе
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

WORKDIR /app

# Создаем нужные каталоги внутри рабочей директории и устанавливаем права
RUN mkdir -p /app/.ssh && chmod 700 /app/.ssh && chown -R node:node /app/.ssh

# Копируем файлы package.json
COPY package*.json ./

# Используем Bun для установки только production зависимостей, пропускаем prepare
RUN bun install --production --no-prepare

# Копируем только собранные файлы из этапа сборки
COPY --from=builder /app/dist ./dist/

# Проверяем, что файлы сборки скопированы
RUN ls -la dist/ || echo "Директория dist не существует или пуста"

# # НЕ Копируем .env файл, т.к. используем environment в docker-compose.yml
# COPY .env ./
# Копируем остальные .env.* файлы, если они есть
COPY .env.* ./

# Создаем пустой .env файл
RUN touch .env

# Экспортируем порт для API и боты
EXPOSE 3000 3001 3002 3003 3004 3005 3006 3007 2999

# Запускаем приложение (вывод Vite)
CMD ["node", "dist/index.js"]

# # ЗАПУСКАЕМ ТЕСТ NODE.JS (ЗАКОММЕНТИРОВАЛИ)
# CMD ["node", "-e", "console.log('--- Node Process Start ---'); console.log('SUPABASE_URL (Node):', process.env.SUPABASE_URL); console.log('BOT_TOKEN_1 (Node):', process.env.BOT_TOKEN_1); console.log('--- Node Process End ---');"]

# # Возвращаем запуск через PM2 (ЗАКОММЕНТИРОВАЛИ)
# CMD ["pm2-runtime", "start", "ecosystem.config.cjs", "--env", "production"]