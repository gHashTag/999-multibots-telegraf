# Этап сборки
FROM oven/bun:1 as builder

# Устанавливаем curl и bash (нужны для установки bun)
RUN apk add --no-cache curl bash

# Устанавливаем bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

WORKDIR /app

<<<<<<< HEAD
COPY package*.json ./
# Используем Bun для установки зависимостей
RUN bun install
=======
COPY package.json bun.lockb* ./
RUN bun install

# Мы не нуждаемся в глобальной установке tsc-alias с Bun
# Bun может использовать локально установленные пакеты напрямую
>>>>>>> origin/feat/vitest-integration

COPY . .

# Создаем временную конфигурацию TypeScript, которая исключает тестовые файлы
RUN cp tsconfig.json tsconfig.build.json && \
    sed -i 's/"include": \["src\/\*\*\/\*.ts", "src\/\*\*\/\*.json", "__tests__\/\*\*\/\*.ts"\]/"include": \["src\/\*\*\/\*.ts", "src\/\*\*\/\*.json"\]/' tsconfig.build.json

<<<<<<< HEAD
# Удаляем старую директорию dist перед сборкой
RUN rm -rf dist
=======
# Выполняем сборку TypeScript с пропуском проверки типов для решения проблем совместимости
# и обрабатываем алиасы путей с помощью tsc-alias через Bun
RUN bun run tsc --skipLibCheck --skipDefaultLibCheck --project tsconfig.build.json && bun run tsc-alias --project tsconfig.build.json
>>>>>>> origin/feat/vitest-integration

# Выполняем сборку с помощью Vite (через bun run build)
RUN bun run build

# Проверяем, что файлы сборки созданы (ожидаем dist/index.js)
RUN ls -la dist/ || echo "Директория dist не существует или пуста"

# Финальный этап
FROM oven/bun:1-alpine

# Устанавливаем curl и bash (нужны для установки bun и других зависимостей)
RUN apk add --no-cache curl bash openssh-client sshpass

# Устанавливаем bun в финальном образе
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

WORKDIR /app

# Создаем непривилегированного пользователя и группу с помощью Alpine команд
RUN addgroup -S bunuser && adduser -S -G bunuser -h /home/bunuser bunuser

<<<<<<< HEAD
# Копируем файлы package.json
COPY package*.json ./

# Используем Bun для установки только production зависимостей, пропускаем prepare
RUN bun install --production --no-prepare
=======
# Создаем нужные каталоги внутри рабочей директории и устанавливаем права
RUN mkdir -p /app/.ssh && chmod 700 /app/.ssh && chown -R bunuser:bunuser /app/.ssh

# Копируем файлы package.json и bun.lockb
COPY package.json bun.lockb* ./

# При установке пропускаем скрипт prepare, который запускает husky install
RUN bun install --production --no-scripts
>>>>>>> origin/feat/vitest-integration

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

<<<<<<< HEAD
# Запускаем приложение (вывод Vite)
CMD ["node", "dist/index.js"]

# # ЗАПУСКАЕМ ТЕСТ NODE.JS (ЗАКОММЕНТИРОВАЛИ)
# CMD ["node", "-e", "console.log('--- Node Process Start ---'); console.log('SUPABASE_URL (Node):', process.env.SUPABASE_URL); console.log('BOT_TOKEN_1 (Node):', process.env.BOT_TOKEN_1); console.log('--- Node Process End ---');"]

# # Возвращаем запуск через PM2 (ЗАКОММЕНТИРОВАЛИ)
# CMD ["pm2-runtime", "start", "ecosystem.config.cjs", "--env", "production"]
=======
# Создаем необходимые директории и устанавливаем правильные разрешения
RUN mkdir -p /app/logs && \
    # Создаем директории для монтирования и устанавливаем правильные разрешения
    mkdir -p /etc/nginx /etc/pki && \
    chmod 755 /etc/nginx /etc/pki && \
    # Убеждаемся, что SSL директории доступны для чтения
    chmod -R 755 /etc/pki && \
    # Устанавливаем правильные разрешения для директорий приложения
    chown -R bunuser:bunuser /app && \
    chmod -R 755 /app && \
    chmod 700 /app/.ssh

# Используем наш entrypoint скрипт для подготовки окружения
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Устанавливаем пользователя для запуска приложения
USER bunuser

# Запускаем приложение
CMD ["bun", "dist/bot.js"]
>>>>>>> origin/feat/vitest-integration
