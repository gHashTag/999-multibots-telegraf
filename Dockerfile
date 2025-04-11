# Этап сборки
FROM node:20-alpine as builder

WORKDIR /app
ENV HOME=/app
ENV HUSKY=0

COPY package*.json ./
# Устанавливаем ВСЕ зависимости, включая devDependencies, для этапа сборки
RUN npm install --no-package-lock --no-audit --ignore-scripts

COPY . .

# Выполняем сборку TypeScript
RUN npx swc src -d dist --source-maps --copy-files

# Финальный этап (версия с tsconfig-paths)
FROM node:20-alpine

WORKDIR /app
ENV HOME=/app
ENV HUSKY=0

# Устанавливаем Ansible и его зависимости через apk
RUN apk add --no-cache ansible openssh-client

# Копируем tsconfig.prod.json ПЕРЕД установкой зависимостей
COPY tsconfig.prod.json ./

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем только production зависимости (включая tsconfig-paths)
RUN npm install --omit=dev --ignore-scripts --no-package-lock --no-audit

# Копируем скомпилированное приложение из этапа сборки
COPY --from=builder /app/dist ./dist

# Экспортируем порты
EXPOSE 3000 3001 3002 3003 3004 3005 3006 3007 2999

# Устанавливаем переменную окружения для tsconfig-paths
ENV TS_NODE_PROJECT=tsconfig.prod.json

# Используем CMD с tsconfig-paths/register
CMD ["node", "-r", "tsconfig-paths/register", "dist/bot.js"]