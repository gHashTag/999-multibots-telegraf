#!/bin/bash

echo "🔍 ПРОВЕРКА ROBOKASSA ЛОГОВ НА PRODUCTION СЕРВЕРЕ"
echo "=================================================="

# Получаем логи контейнера
ssh -o StrictHostKeyChecking=no prod999 <<'EOF' || echo "❌ SSH connection failed"
cd /root/999-agents-telegraf

echo ""
echo "📋 ПОСЛЕДНИЕ 300 СТРОК ЛОГОВ (только ROBOKASSA):"
echo "=================================================="
docker logs 999-multibots --tail 300 2>&1 | grep -E "(ROBOKASSA|Infisical|Загружено)" | tail -50

echo ""
echo "📋 ПОСЛЕДНИЕ 100 СТРОК ВСЕХ ЛОГОВ:"
echo "=================================================="
docker logs 999-multibots --tail 100 2>&1

echo ""
echo "🔍 ПОИСК MERCHANT_LOGIN В ЛОГАХ:"
echo "=================================================="
docker logs 999-multibots --tail 500 2>&1 | grep -i merchant || echo "❌ Merchant login не найден в логах"

echo ""
echo "🔍 ПОИСК ROBOKASSA В ЛОГАХ:"
echo "=================================================="
docker logs 999-multibots --tail 500 2>&1 | grep -i robokassa | head -20

echo ""
echo "✅ ПРОВЕРКА ЗАВЕРШЕНА"
EOF

echo ""
echo "💡 Если SSH недоступен, можно проверить через веб-интерфейс:"
echo "   curl http://188.137.250.69:3001/api/diagnostic/robokassa"
