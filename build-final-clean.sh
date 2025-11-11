#!/bin/bash
set -e

echo "🚀 ФИНАЛЬНАЯ ЧИСТАЯ СБОРКА"
echo "======================================"

# 1. Проверка Docker
echo ""
echo "1️⃣ Проверка Docker daemon..."
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker daemon не запущен!"
  echo "   Ждём 10 секунд..."
  sleep 10
  if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker всё ещё недоступен. Выход."
    exit 1
  fi
fi
echo "✅ Docker daemon готов"

# 2. Очистка старых билдов
echo ""
echo "2️⃣ Очистка старых сборок..."
docker builder prune -f > /dev/null 2>&1 || true
echo "✅ Кэш очищен"

# 3. Проверка build context
echo ""
echo "3️⃣ Проверка build context..."
echo "   Размер проекта (без .git): $(du -sh --exclude=.git . 2>/dev/null | cut -f1 || du -sh . | cut -f1)"
echo "   .dockerignore: $(wc -l < .dockerignore) строк"
echo ""

# 4. Запуск сборки с таймингом
echo "4️⃣ Запуск Docker build..."
echo "   Dockerfile: Dockerfile.optimized"
echo "   Tag: 999-multibots:latest"
echo ""
echo "🕐 СТАРТ: $(date +%H:%M:%S)"
echo "======================================"
echo ""

START=$(date +%s)

export DOCKER_BUILDKIT=1
docker build \
  -f Dockerfile.optimized \
  -t 999-multibots:latest \
  --progress=plain \
  . 2>&1 | tail -50

EXIT_CODE=$?
END=$(date +%s)
DURATION=$((END - START))

echo ""
echo "======================================"
echo "🕐 КОНЕЦ: $(date +%H:%M:%S)"
echo "⏱️  ВРЕМЯ: ${DURATION} секунд ($(($DURATION / 60)) минут $(($DURATION % 60)) секунд)"

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "✅ СБОРКА УСПЕШНА!"
  echo ""
  echo "📊 Информация об image:"
  docker images | grep "999-multibots" | head -3
  echo ""
  echo "🎉 Готово! Можно деплоить на production."
else
  echo ""
  echo "❌ СБОРКА ПРОВАЛИЛАСЬ (exit code: $EXIT_CODE)"
  echo ""
  echo "Последние 30 строк лога:"
  docker build -f Dockerfile.optimized -t 999-multibots:latest . 2>&1 | tail -30
fi

exit $EXIT_CODE
