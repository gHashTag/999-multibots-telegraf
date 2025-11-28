# 🚀 FASTEST Dockerfile с esbuild (10-100x быстрее!)
# esbuild бандлит TypeScript в один файл за секунды

# Stage 1: Dependencies только для production
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev --prefer-offline

# Stage 2: Builder с esbuild
FROM node:20-slim AS builder
WORKDIR /app

# Установка esbuild глобально (ОЧЕНЬ быстро)
RUN npm install -g esbuild

COPY package.json package-lock.json ./
RUN npm install --prefer-offline

COPY . .

# ✅ Проверка TypeScript перед сборкой (прерывает сборку при ошибках)
RUN npx tsc --noEmit || (echo "❌ TypeScript errors found! Build aborted." && exit 1)

# esbuild бандлит все в один файл за секунды!
# --packages=external: НЕ бандлить node_modules (будут в runtime)
RUN esbuild src/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=cjs \
  --outfile=dist/index.js \
  --packages=external \
  --sourcemap \
  --minify

# Stage 3: Production (минимальный runtime)
FROM node:20-slim
WORKDIR /app

# Security: Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Copy production dependencies from deps stage
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy bundled app from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./

# ✅ Создать папки uploads, logs, temp, tmp с правильными правами (ПЕРЕД USER nodejs!)
RUN mkdir -p uploads logs temp tmp && chown -R nodejs:nodejs uploads logs temp tmp

# Environment
ENV NODE_ENV=production

# Switch to non-root user
USER nodejs

# ✅ ИСПРАВЛЕНО: Изменен порт с 2999 на 3000 согласно обновлению всей инфраструктуры
EXPOSE 3000

CMD ["node", "dist/index.js"]
