# 🚀 FASTEST Dockerfile с esbuild (10-100x быстрее!)
# esbuild бандлит TypeScript в один файл за секунды

# Stage 1: Dependencies только для production
FROM node:20-slim AS deps
WORKDIR /app

# Install build tools for native modules (ssh2, etc.)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY package-lock.json* ./
# scripts/install-hooks.cjs нужен ДО npm install: npm выполняет `prepare`
# сразу после установки, а prepare зовёт этот файл. Без него сборка падает
# с 'Cannot find module'. Сам скрипт видит, что .git нет, и молча выходит.
COPY scripts/install-hooks.cjs ./scripts/
RUN npm install --omit=dev

# Stage 2: Builder с esbuild
FROM node:20-slim AS builder
WORKDIR /app

# Инструменты сборки нативных модулей. Стадия deps их ставит, а builder
# начинается с чистого node:20-slim — и полный `npm install` ниже (с dev-
# зависимостями) падал на utf-8-validate: node-gyp не находил Python
# («gyp ERR! find Python»). Из-за этого образ не собирался вообще.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Установка esbuild глобально (ОЧЕНЬ быстро)
RUN npm install -g esbuild

COPY package.json ./
COPY package-lock.json* ./
COPY scripts/install-hooks.cjs ./scripts/
RUN npm install

COPY . .

ARG SKIP_TYPE_CHECK=true
RUN if [ "$SKIP_TYPE_CHECK" != "true" ]; then \
      npx tsc --noEmit || (echo "❌ TypeScript errors found! Build aborted." && exit 1); \
    else \
      echo "⚠️  TypeScript check SKIPPED (SKIP_TYPE_CHECK=true)"; \
    fi

# esbuild бандлит все в один файл за секунды!
# --packages=external: НЕ бандлить node_modules (будут в runtime)
# Принудительная пересборка без кэша (WORKAROUND для ошибки esbuild)
RUN rm -rf /root/.npm /root/.cache /root/.cache/esbuild && npm install -g esbuild
RUN esbuild src/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=cjs \
  --outfile=dist/index.js \
  --packages=external \
  --sourcemap

# Stage 3: Production (минимальный runtime)
FROM node:20-slim
WORKDIR /app

# Install ffmpeg for video processing (morphing, concatenation)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Security: Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Copy production dependencies from deps stage
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy bundled app from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./

# ✅ Создать папки uploads, logs, temp, tmp с правильными правами (ПЕРЕД USER nodejs!)
# ✅ Также создать .video-tasks.json для локального хранения задач
RUN mkdir -p uploads logs temp tmp && \
    touch .video-tasks.json && \
    chown -R nodejs:nodejs uploads logs temp tmp .video-tasks.json

# Environment
ENV NODE_ENV=production

# Switch to non-root user
USER nodejs

# ✅ ИСПРАВЛЕНО: Все порты ботов 3000-3011
EXPOSE 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010 3011

CMD ["node", "dist/index.js"]
