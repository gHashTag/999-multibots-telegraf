# --- 🏗️ Стадия Сборки Зависимостей (Дхарма Подготовки) ---
FROM oven/bun:1 as deps

WORKDIR /opt/app/999-multibots-telegraf

# Устанавливаем OpenSSL для Prisma и других зависимостей
RUN apt-get update -y && apt-get install -y openssl --no-install-recommends && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
# Копируем и другие нужные конфиги для установки/сборки
COPY tsconfig.json ./
COPY supabase ./supabase/

# Устанавливаем зависимости с помощью Bun
RUN bun install --frozen-lockfile

# Убедимся, что tsc-alias установлен глобально для сборки
# RUN npm install -g tsc-alias # Убираем, Bun должен справляться или build скрипт сделает

# COPY . . # Убираем полное копирование здесь

# Создаем временную конфигурацию TypeScript, которая исключает тестовые файлы
# RUN cp tsconfig.json tsconfig.build.json && \
#    sed -i 's/"include": \["src\/\*\*\/\*\.ts", "src\/\*\*\/\*\.json", "__tests__\/\*\*\/\*\.ts"\]/"include": \["src\/\*\*\/\*\.ts", "src\/\*\*\/\*\.json"\]/' tsconfig.build.json # Убираем, bun build должен использовать основной tsconfig

# Выполняем сборку TypeScript с пропуском проверки типов для решения проблем совместимости
# и обрабатываем алиасы путей с помощью tsc-alias (включено в скрипт build:nocheck)
# RUN npx tsc --skipLibCheck --skipDefaultLibCheck --project tsconfig.build.json && npx tsc-alias --project tsconfig.build.json # Заменим на bun run build

# Проверяем, что файлы сборки созданы
# RUN ls -la dist/ || echo "Директория dist не существует или пуста" # Проверим после bun build

# --- 🚀 Стадия Приложения (Карма Исполнения) --- # Объединим с deps пока
# FROM oven/bun:1 as app
# WORKDIR /opt/app/999-multibots-telegraf
# ENV NODE_ENV=production

# Копируем только исходный код из контекста сборки
# COPY src ./src

# Копируем зависимости, схему и конфиги из стадии deps
# COPY --from=deps /opt/app/999-multibots-telegraf/node_modules ./node_modules
# COPY --from=deps /opt/app/999-multibots-telegraf/supabase ./supabase/
# COPY --from=deps /opt/app/999-multibots-telegraf/package.json ./package.json
# COPY --from=deps /opt/app/999-multibots-telegraf/bun.lock ./bun.lock
# COPY --from=deps /opt/app/999-multibots-telegraf/tsconfig.json ./tsconfig.json

# --- Вместо отдельной стадии app, делаем сборку прямо в deps --- 
WORKDIR /opt/app/999-multibots-telegraf
COPY . .

# Генерируем Prisma Client (Проявление Сущности)
# Осторожно с путями и OpenSSL!
RUN bunx prisma generate --schema=./supabase/schema.prisma

# Собираем проект с помощью Bun
RUN bun run build

# --- 🛡️ Финальная Стадия (Мокша - Облегченный Образ) ---
FROM oven/bun:1-slim as final
WORKDIR /opt/app/999-multibots-telegraf
ENV NODE_ENV=production

# Копируем необходимые артефакты из стадии deps (где была сборка)
COPY --from=deps /opt/app/999-multibots-telegraf/dist ./dist/
COPY --from=deps /opt/app/999-multibots-telegraf/node_modules ./node_modules/
COPY --from=deps /opt/app/999-multibots-telegraf/package.json ./package.json
COPY --from=deps /opt/app/999-multibots-telegraf/bun.lock ./bun.lock
COPY --from=deps /opt/app/999-multibots-telegraf/supabase ./supabase/
COPY .env.production ./.env

# Устанавливаем правильного владельца для рабочей директории
# RUN chown -R node:node /app # Пользователь в oven/bun другой!
USER bun # Явно указываем пользователя bun

# Экспортируем порт для API и боты
EXPOSE 2999 3000 3001 3002 3003 3004 3005 3006 3007

# Используем наш entrypoint скрипт для подготовки окружения
# ENTRYPOINT ["/app/docker-entrypoint.sh"] # Entrypoint может не работать с Bun так же

# Запускаем приложение с помощью Bun
CMD [ "bun", "run", "start" ]