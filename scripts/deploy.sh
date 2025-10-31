#!/bin/bash

# 🚀 АВТОМАТИЧЕСКОЕ РАЗВЕРТЫВАНИЕ В ПРОДАКШН
# Этот скрипт выполняет полный цикл развертывания изменений TypeScript/JavaScript в продакшн

set -e  # Остановиться при любой ошибке

echo "🚀 ============================================"
echo "🚀 АВТОМАТИЧЕСКОЕ РАЗВЕРТЫВАНИЕ В ПРОДАКШН"
echo "🚀 ============================================"

# Проверяем, что мы находимся в корне проекта
if [ ! -f "package.json" ]; then
    echo "❌ ОШИБКА: Запустите скрипт из корня проекта (где находится package.json)"
    exit 1
fi

# Проверяем, что есть изменения для коммита
if git diff --quiet && git diff --staged --quiet; then
    echo "ℹ️  Нет изменений для коммита, продолжаем развертывание..."
else
    echo "📝 Найдены изменения, создаем коммит..."

    # Добавляем все изменения
    git add .

    # Просим пользователя ввести сообщение коммита
    echo "💬 Введите сообщение коммита (или нажмите Enter для автоматического):"
    read -r COMMIT_MSG

    if [ -z "$COMMIT_MSG" ]; then
        COMMIT_MSG="🔄 Auto-deploy: Update code for production deployment"
    fi

    # Создаем коммит
    git commit -m "$COMMIT_MSG

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

    echo "✅ Коммит создан: $COMMIT_MSG"
fi

# Пушим изменения в production branch
echo "📤 Отправляем изменения в production branch..."
git push origin production

echo "✅ Изменения отправлены в репозиторий"

# Подключаемся к продакшн серверу и выполняем развертывание
echo "🔄 Подключаемся к продакшн серверу и выполняем развертывание..."

ssh -i ~/.ssh/zomro root@212.86.115.30 << 'EOF'
set -e

echo "📥 Переходим в директорию проекта..."
cd /root/999-agents-telegraf

echo "📥 Стягиваем последние изменения из production branch..."
git pull origin production

echo "🛑 Останавливаем старый Docker контейнер..."
if docker ps -q -f name=999-multibots | grep -q .; then
    docker stop 999-multibots
    echo "✅ Контейнер остановлен"
else
    echo "ℹ️  Контейнер уже остановлен"
fi

echo "🗑️  Удаляем старый Docker контейнер..."
if docker ps -aq -f name=999-multibots | grep -q .; then
    docker rm 999-multibots
    echo "✅ Контейнер удален"
else
    echo "ℹ️  Контейнер уже удален"
fi

echo "🔥 КРИТИЧЕСКИ ВАЖНО: Пересобираем Docker БЕЗ кеша (--no-cache)..."
echo "⚠️  Это ОБЯЗАТЕЛЬНО при изменении TypeScript/JavaScript кода!"
docker build --no-cache -t 999-multibots .

echo "🚀 Запускаем новый контейнер с обновленным кодом..."
docker run -d --name 999-multibots --restart=always \
  -p 2999:2999 \
  -p 3000:3000 \
  -p 3001:3001 \
  -p 3002:3002 \
  -p 3003:3003 \
  -p 3004:3004 \
  -p 3005:3005 \
  -p 3006:3006 \
  -p 3007:3007 \
  -p 3008:3008 \
  -p 3009:3009 \
  -p 3010:3010 \
  --env-file /root/999-agents-telegraf/.env \
  999-multibots

echo "⏳ Ждем 15 секунд для полного запуска системы..."
sleep 15

echo "📋 Проверяем статус нового контейнера..."
docker ps | grep 999-multibots

echo "📜 Проверяем логи запуска (последние 20 строк)..."
docker logs 999-multibots --tail 20

echo ""
echo "🎉 ============================================"
echo "🎉 РАЗВЕРТЫВАНИЕ ЗАВЕРШЕНО УСПЕШНО!"
echo "🎉 ============================================"
echo "✅ Все боты запущены и работают"
echo "✅ Изменения применены в продакшне"
echo "📊 Проверьте логи выше для подтверждения"
echo ""

EOF

echo ""
echo "🎊 ============================================"
echo "🎊 АВТОМАТИЧЕСКОЕ РАЗВЕРТЫВАНИЕ ЗАВЕРШЕНО!"
echo "🎊 ============================================"
echo ""
echo "📋 ЧТО БЫЛО ВЫПОЛНЕНО:"
echo "  ✅ Изменения закоммичены и отправлены в репозиторий"
echo "  ✅ Код обновлен на продакшн сервере"
echo "  ✅ Docker контейнер пересобран БЕЗ кеша"
echo "  ✅ Новый контейнер запущен с обновленным кодом"
echo "  ✅ Проверка статуса и логов выполнена"
echo ""
echo "🔍 ДОПОЛНИТЕЛЬНЫЕ КОМАНДЫ ДЛЯ ПРОВЕРКИ:"
echo "  📜 Логи: ssh -i ~/.ssh/zomro root@212.86.115.30 'docker logs 999-multibots --tail 50'"
echo "  📊 Статус: ssh -i ~/.ssh/zomro root@212.86.115.30 'docker ps | grep 999-multibots'"
echo "  🔍 Проверка кода: ssh -i ~/.ssh/zomro root@212.86.115.30 'docker exec 999-multibots grep \"версия_кода\" /app/dist/...'"
echo ""

# Показываем время выполнения
echo "⏰ Развертывание завершено в: $(date)"