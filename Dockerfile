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

# Финальный этап
FROM node:20-alpine

WORKDIR /app
ENV HOME=/app
ENV HUSKY=0

# Устанавливаем python и pip для Ansible
RUN apk add --no-cache python3 py3-pip
# Устанавливаем Ansible
RUN pip install --no-cache-dir ansible

# Копируем tsconfig.prod.json (вместо tsconfig.json) ДО установки зависимостей
COPY tsconfig.prod.json ./

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем только production зависимости (включая tsconfig-paths)
RUN npm install --omit=dev --ignore-scripts --no-package-lock --no-audit

# Копируем скомпилированное приложение из этапа сборки
COPY --from=builder /app/dist ./dist

# Экспортируем порт для API и боты
EXPOSE 3000 3001 3002 3003 3004 3005 3006 3007 2999

# Устанавливаем переменную окружения для tsconfig-paths
ENV TS_NODE_PROJECT=tsconfig.prod.json

CMD ["node", "-r", "tsconfig-paths/register", "dist/bot.js"]