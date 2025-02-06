# Этап сборки
FROM node:20-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Выполняем сборку TypeScript
RUN npm run build

# Финальный этап
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

# Копируем только необходимые файлы из этапа сборки
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/bot.js"]