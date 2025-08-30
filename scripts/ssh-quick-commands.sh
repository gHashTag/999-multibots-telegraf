#!/bin/bash

# 🚀 БЫСТРЫЕ КОМАНДЫ ДЛЯ SSH МОНИТОРИНГА PRODUCTION
# Использование: ssh -i ~/.ssh/selectel root@185.161.67.53 "$(cat scripts/ssh-quick-commands.sh)"

echo "======================================"
echo "🔍 БЫСТРАЯ ДИАГНОСТИКА PRODUCTION"
echo "======================================"

# 1. СТАТУС PM2
echo -e "\n📊 PM2 СТАТУС:"
pm2 list

# 2. ПОСЛЕДНИЕ ЛОГИ
echo -e "\n📝 ПОСЛЕДНИЕ ЛОГИ БОТОВ (50 строк):"
pm2 logs bot-farm --lines 50 --nostream

# 3. ПРОВЕРКА СБОРКИ
echo -e "\n🏗️ ПРОВЕРКА СБОРКИ:"
if [ -d "/root/999-agents-telegraf/dist" ]; then
    echo "✅ Папка dist существует"
    echo "📅 Дата последней сборки:"
    ls -la /root/999-agents-telegraf/dist/index.js | awk '{print $6, $7, $8}'
else
    echo "❌ Папка dist НЕ найдена - требуется сборка!"
fi

# 4. СТАТУС GIT
echo -e "\n🔧 GIT СТАТУС:"
cd /root/999-agents-telegraf && git status --short
echo "Текущая ветка: $(git branch --show-current)"
echo "Последний коммит: $(git log -1 --oneline)"

# 5. ПРОВЕРКА ПРОЦЕССОВ
echo -e "\n⚙️ ПРОЦЕССЫ NODE:"
ps aux | grep node | grep -v grep | head -5

# 6. ИСПОЛЬЗОВАНИЕ ПАМЯТИ
echo -e "\n💾 ПАМЯТЬ:"
free -h | grep Mem

# 7. ПРОВЕРКА ПОРТОВ
echo -e "\n🔌 ОТКРЫТЫЕ ПОРТЫ:"
netstat -tulpn | grep -E ':(2999|3000|3001|3002|3003|3004|3005|3006|3007|3008|3009|8080)'

# 8. ПОСЛЕДНИЕ ОШИБКИ
echo -e "\n❌ ПОСЛЕДНИЕ ОШИБКИ:"
pm2 logs bot-farm --err --lines 20 --nostream

echo -e "\n======================================"
echo "✅ ДИАГНОСТИКА ЗАВЕРШЕНА"
echo "======================================"