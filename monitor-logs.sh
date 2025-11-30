#!/bin/bash

# Мониторинг логов сервера для диагностики Replicate API

echo "🔍 МОНИТОРИНГ ЛОГОВ REPLICATE API"
echo "=================================="
echo ""
echo "Сервер: 188.137.250.69:3001"
echo "Пользователь: 144022504"
echo "Фокус: token diagnostics"
echo ""
echo "💡 Начните тест в Telegram и логи появятся здесь автоматически"
echo "💡 Нажмите Ctrl+C для выхода"
echo ""
echo "⏳ Ожидание логов..."
echo ""

# Мониторим логи в реальном времени, фильтруем по диагностике
ssh root@188.137.250.69 'docker logs 999-multibots -f --tail 0' 2>/dev/null | grep -E --line-buffered \
  "tokenChars|tokenTrimLength|DIAGNOSTIC|replicate.run|hasToken|tokenLength|tokenPreview|api_type.*replicate" | \
while IFS= read -r line; do
    echo "[$(date '+%H:%M:%S')] $line"
done
