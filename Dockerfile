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
RUN npm install --omit=dev

# Stage 2: Builder с esbuild
FROM node:20-slim AS builder
WORKDIR /app

# Установка esbuild глобально (ОЧЕНЬ быстро)
RUN npm install -g esbuild

COPY package.json ./
COPY package-lock.json* ./
RUN npm install

COPY . .

# ✅ Проверка TypeScript перед сборкой (можно пропустить с --build-arg SKIP_TYPE_CHECK=true)
ARG SKIP_TYPE_CHECK=false
RUN if [ "$SKIP_TYPE_CHECK" != "true" ]; then \
      npx tsc --noEmit || (echo "❌ TypeScript errors found! Build aborted." && exit 1); \
    else \
      echo "⚠️  TypeScript check SKIPPED (SKIP_TYPE_CHECK=true)"; \
    fi

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

# ✅ Создать папки uploads, logs, temp с правильными правами (ПЕРЕД USER nodejs!)
RUN mkdir -p uploads logs temp && chown -R nodejs:nodejs uploads logs temp

# Environment
ENV NODE_ENV=production

# Switch to non-root user
USER nodejs

EXPOSE 2999

CMD ["node", "dist/index.js"]
