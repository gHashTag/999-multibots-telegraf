#!/bin/bash
# Проверка переменных INNGEST в production контейнере

echo "🔍 ПРОВЕРКА ПЕРЕМЕННЫХ INNGEST В PRODUCTION"
echo "=============================================="

# SSH доступен?
if ssh -o ConnectTimeout=5 root@188.137.250.69 "echo 'SSH OK'" 2>/dev/null; then
    echo "✅ SSH доступен"

    echo -e "\n1️⃣ Проверяем переменные в process.env:"
    ssh root@188.137.250.69 "docker exec 999-multibots node -e \"
      console.log('INNGEST_EVENT_KEY:', !!process.env.INNGEST_EVENT_KEY, process.env.INNGEST_EVENT_KEY?.substring(0, 10) + '...');
      console.log('INNGEST_SIGNING_KEY:', !!process.env.INNGEST_SIGNING_KEY, process.env.INNGEST_SIGNING_KEY?.substring(0, 10) + '...');
      console.log('RENDER_INNGEST_EVENT_KEY:', !!process.env.RENDER_INNGEST_EVENT_KEY);
      console.log('RENDER_INNGEST_SIGNING_KEY:', !!process.env.RENDER_INNGEST_SIGNING_KEY);
    \""

    echo -e "\n2️⃣ Проверяем логи запуска (последние 50 строк):"
    ssh root@188.137.250.69 "docker logs 999-multibots --tail 50 | grep -E 'INFISICAL|INNGEST'"

    echo -e "\n3️⃣ Проверяем диагностический API:"
    curl -s http://188.137.250.69:3001/api/diagnostic/template2 | jq '.envVars'

else
    echo "❌ SSH недоступен, проверяем через API..."

    echo -e "\n🔍 Проверяем через diagnostic API:"
    echo "URL: http://188.137.250.69:3001/api/diagnostic/template2"

    # Проверяем доступность
    if curl -s --max-time 5 http://188.137.250.69:3001/health > /dev/null; then
        echo "✅ Сервер доступен"

        echo -e "\n📊 Ответ диагностики:"
        curl -s http://188.137.250.69:3001/api/diagnostic/template2 | jq '.' 2>/dev/null || curl -s http://188.137.250.69:3001/api/diagnostic/template2
    else
        echo "❌ Сервер недоступен"
    fi
fi

echo -e "\n=============================================="
echo "📋 ВЫВОДЫ:"
echo "1. Если переменные undefined - добавьте их в Infisical PRODUCTION"
echo "2. Если есть в dev но нет в prod - скопируйте из dev в prod"
echo "3. Перезапустите контейнер: docker restart 999-multibots"
