# Этап сборки
FROM oven/bun:1 as builder

# Устанавливаем curl и bash (нужны для установки bun)
RUN apk add --no-cache curl bash

# Устанавливаем bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

WORKDIR /app

# Копируем файлы package.json и bun.lockb
COPY package.json bun.lockb* ./
# Используем Bun для установки зависимостей
RUN bun install

# Мы не нуждаемся в глобальной установке tsc-alias с Bun
# Bun может использовать локально установленные пакеты напрямую

COPY . .

# Создаем временную конфигурацию TypeScript, которая исключает тестовые файлы
RUN cp tsconfig.json tsconfig.build.json && \
    sed -i 's/"include": \["src\/\*\*\/\*.ts", "src\/\*\*\/\*.json", "__tests__\/\*\*\/\*.ts"\]/"include": \["src\/\*\*\/\*.ts", "src\/\*\*\/\*.json"\]/' tsconfig.build.json

# Выполняем сборку TypeScript с пропуском проверки типов для решения проблем совместимости
# и обрабатываем алиасы путей с помощью tsc-alias через Bun (tsc-alias может быть не нужен с bun build?)
# RUN bun run tsc --skipLibCheck --skipDefaultLibCheck --project tsconfig.build.json && bun run tsc-alias --project tsconfig.build.json

# Выполняем сборку с помощью Vite (через bun run build)
RUN bun run build

# Проверяем, что файлы сборки созданы (ожидаем dist/bot.js)
RUN ls -la dist/ || echo "Директория dist не существует или пуста"
RUN test -f dist/bot.js || (echo "Файл dist/bot.js не найден!" && exit 1)

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

# Создаем нужные каталоги внутри рабочей директории и устанавливаем права
RUN mkdir -p /app/.ssh && chmod 700 /app/.ssh && chown -R bunuser:bunuser /app/.ssh

# Копируем файлы package.json и bun.lockb
COPY package.json bun.lockb* ./

# При установке пропускаем скрипт prepare, который запускает husky install
# Устанавливаем только production зависимости
RUN bun install --production --no-scripts

# Копируем только собранные файлы из этапа сборки
COPY --from=builder /app/dist ./dist/

# Проверяем, что файлы сборки скопированы
RUN ls -la dist/ || echo "Директория dist не существует или пуста"
RUN test -f dist/bot.js || (echo "Файл dist/bot.js не найден!" && exit 1)

# # НЕ Копируем .env файл, т.к. используем environment в docker-compose.yml
# COPY .env ./\n# Копируем остальные .env.* файлы, если они есть\nCOPY .env.* ./

# Создаем пустой .env файл, если он нужен для работы приложения без docker-compose
RUN touch .env

# Экспортируем порт для API и боты
EXPOSE 3000 3001 3002 3003 3004 3005 3006 3007 2999

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

# Используем наш entrypoint скрипт для подготовки окружения (если он нужен)
# ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Устанавливаем пользователя для запуска приложения
USER bunuser

# Запускаем приложение
CMD ["bun", "dist/bot.js"]
