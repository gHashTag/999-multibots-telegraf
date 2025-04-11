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

# Исправляем пути с помощью tsc-alias
RUN npx tsc-alias

# ---- ОТЛАДОЧНЫЕ КОМАНДЫ ----
# Показываем содержимое папки dist
# ---- ОТЛАДОЧНЫЕ КОМАНДЫ (Запись в файлы) ----
# Сохраняем содержимое папки dist в файл
RUN echo "--- Content of dist directory after tsc-alias ---" > /tmp/dist_content.txt && ls -R dist >> /tmp/dist_content.txt
# Ищем путь к логгеру и сохраняем результат в файл
RUN echo "--- Grepping for logger path in dist/config/index.js ---" > /tmp/grep_result.txt && \
    (grep -E "'../src/utils/logger'|'@/utils/logger'|'./utils/logger'" dist/config/index.js || echo "--- Logger path not found in dist/config/index.js ---") >> /tmp/grep_result.txt
# --------------------------


# Финальный этап
FROM node:20-alpine

WORKDIR /app
ENV HOME=/app
ENV HUSKY=0

# Устанавливаем зависимости для Ansible
RUN apk add --no-cache \
    python3 \
    py3-pip \
    openssh-client \
    sshpass \
    nginx

# Создаем виртуальное окружение и устанавливаем Ansible
RUN python3 -m venv /opt/ansible-venv \
    && . /opt/ansible-venv/bin/activate \
    && pip install --no-cache-dir ansible

COPY package*.json ./
# Устанавливаем только production зависимости для финального образа
RUN npm install --omit=dev --ignore-scripts --no-package-lock --no-audit

# Копируем ТОЛЬКО скомпилированные и исправленные файлы из этапа сборки
COPY --from=builder /app/dist ./dist

# Экспортируем порт для API и боты
EXPOSE 3000 3001 3002 3003 3004 3005 3006 3007 2999

CMD ["node", "dist/bot.js"]