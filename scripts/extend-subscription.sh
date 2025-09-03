#!/bin/bash

# Скрипт для продления подписки пользователю 7007992081

echo "🚀 Продление подписки для пользователя 7007992081..."

# Telegram ID пользователя
USER_ID="7007992081"
SUBSCRIPTION_TYPE="NEUROPHOTO"
DURATION_DAYS=30

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "📊 Параметры продления:"
echo "   • User ID: $USER_ID"
echo "   • Тип подписки: $SUBSCRIPTION_TYPE"
echo "   • Период: $DURATION_DAYS дней"
echo ""

# Создаем TypeScript файл для выполнения
cat > /tmp/extend-subscription.ts << 'EOF'
import { adminRenewSubscription } from './src/core/supabase/adminRenewSubscription'
import { checkSubscriptionByTelegramId } from './src/core/supabase/checkSubscriptionByTelegramId'
import { getUserByTelegramId } from './src/core/supabase/getUserByTelegramId'
import { SubscriptionType } from './src/interfaces/subscription.interface'

async function extendSubscription() {
  const targetUserId = '7007992081'
  
  console.log('🔍 Проверяем пользователя...')
  
  // Проверяем существование пользователя
  const user = await getUserByTelegramId(targetUserId)
  if (!user) {
    console.error('❌ Пользователь не найден!')
    process.exit(1)
  }
  
  console.log('✅ Пользователь найден:', {
    id: user.id,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name
  })
  
  // Проверяем текущую подписку
  const currentSubscription = await checkSubscriptionByTelegramId(targetUserId)
  console.log('📊 Текущая подписка:', currentSubscription)
  
  // Продлеваем подписку
  console.log('⌛ Продлеваем подписку...')
  const result = await adminRenewSubscription({
    telegram_id: targetUserId,
    subscription_type: SubscriptionType.NEUROPHOTO,
    duration_days: 30,
    bot_name: 'admin_script',
    reason: 'Продление для доиспользования ботов'
  })
  
  if (result.success) {
    console.log('✅ Подписка успешно продлена!')
    
    // Проверяем новый статус
    const newSubscription = await checkSubscriptionByTelegramId(targetUserId)
    console.log('📊 Новая подписка:', newSubscription)
  } else {
    console.error('❌ Ошибка продления:', result.error)
    process.exit(1)
  }
}

extendSubscription()
  .then(() => {
    console.log('✨ Процесс завершен успешно!')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Критическая ошибка:', error)
    process.exit(1)
  })
EOF

# Выполняем TypeScript файл
echo "⚙️  Выполняем продление подписки..."
cd "$(dirname "$0")/.."
npx tsx /tmp/extend-subscription.ts

# Проверяем результат
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Подписка успешно продлена!${NC}"
  echo ""
  echo "📱 Отправьте пользователю сообщение:"
  echo "   /extend_7007992081 - для автоматического уведомления через бота"
else
  echo -e "${RED}❌ Произошла ошибка при продлении подписки${NC}"
  exit 1
fi

# Удаляем временный файл
rm -f /tmp/extend-subscription.ts

echo ""
echo "✨ Готово! Пользователь 7007992081 может продолжить использование бота."