#!/bin/bash

##############################################################################
# Production Script: Grant NEUROVIDEO Subscription to User 693774948
# Server: 212.86.115.30 (Zomro)
# Project: /root/bot-farm
# Task: Add "Мировидео" (NEUROVIDEO) subscription and grant full access
##############################################################################

set -e  # Exit on error

TELEGRAM_ID="693774948"
SERVER="root@212.86.115.30"
SSH_KEY="$HOME/.ssh/zomro"
PROJECT_PATH="/root/bot-farm"

echo "=========================================="
echo "🚀 Production User Management"
echo "=========================================="
echo "📱 Telegram ID: $TELEGRAM_ID"
echo "🎯 Task: Grant NEUROVIDEO subscription"
echo "🌐 Server: $SERVER"
echo "📂 Project: $PROJECT_PATH"
echo "=========================================="
echo ""

# Проверка SSH ключа
if [ ! -f "$SSH_KEY" ]; then
    echo "❌ ERROR: SSH key not found at $SSH_KEY"
    exit 1
fi

echo "✅ SSH key found: $SSH_KEY"
echo ""

# Копирование скрипта на сервер
echo "📤 [1/3] Uploading management script to production server..."
scp -i "$SSH_KEY" \
    /Users/playra/999-agents-telegraf/scripts/manage-user-693774948.js \
    "$SERVER:$PROJECT_PATH/scripts/" || {
    echo "❌ Failed to upload script"
    exit 1
}
echo "✅ Script uploaded successfully"
echo ""

# Выполнение скрипта на production сервере
echo "⚡ [2/3] Executing user management on production server..."
echo "=========================================="
ssh -i "$SSH_KEY" "$SERVER" << 'ENDSSH'
cd /root/bot-farm

# Загрузка переменных окружения
if [ ! -f ".env" ]; then
    echo "❌ ERROR: .env file not found in /root/bot-farm"
    exit 1
fi

# Выполнение Node.js скрипта с загрузкой .env
export $(cat .env | grep -v '^#' | xargs)

# Запуск скрипта управления пользователем
node scripts/manage-user-693774948.js

ENDSSH

RESULT=$?
echo "=========================================="
echo ""

if [ $RESULT -eq 0 ]; then
    echo "✅ [3/3] User management completed successfully!"
    echo ""
    echo "=========================================="
    echo "📊 FINAL REPORT"
    echo "=========================================="
    echo "📱 Telegram ID: $TELEGRAM_ID"
    echo "🎬 Subscription: NEUROVIDEO (Мировидео)"
    echo "✅ Status: GRANTED & ACTIVE"
    echo "⏰ Duration: 30 days from now"
    echo "🚀 Access: FULL (all video generation features)"
    echo "=========================================="
    echo ""
    echo "🔍 Verification Commands:"
    echo "ssh -i ~/.ssh/zomro root@212.86.115.30 'cd /root/bot-farm && node -e \"..."
    echo ""
    echo "📝 Next Steps:"
    echo "1. User can now access all NEUROVIDEO features"
    echo "2. Subscription valid for 30 days"
    echo "3. User will receive confirmation in bot"
    echo ""
else
    echo "❌ [3/3] User management FAILED!"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "1. Check .env file on production server"
    echo "2. Verify Supabase credentials"
    echo "3. Check user exists in database (ran /start)"
    echo "4. Review logs above for specific errors"
    echo ""
    echo "Manual execution:"
    echo "ssh -i ~/.ssh/zomro root@212.86.115.30"
    echo "cd /root/bot-farm"
    echo "node scripts/manage-user-693774948.js"
    exit 1
fi
