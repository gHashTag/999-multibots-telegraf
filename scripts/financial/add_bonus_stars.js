/**
 * Скрипт для добавления бонусных звезд пользователю
 * Запуск: node add_bonus_stars.js
 */

const { updateUserBalance } = require('./dist/core/supabase/updateUserBalance.js')
const { PaymentType } = require('./dist/interfaces/payments.interface.js')

// Пользователь которому добавляем звезды
const TELEGRAM_ID = '435572800'
const BONUS_AMOUNT = 20000 // 20,000 звезд

async function addBonusStars() {
  console.log('🎁 Добавляем бонусные звезды пользователю...')
  console.log(`👤 Telegram ID: ${TELEGRAM_ID}`)
  console.log(`💰 Сумма: ${BONUS_AMOUNT} звезд`)
  console.log('⏳ Выполнение...\n')

  try {
    const result = await updateUserBalance(
      TELEGRAM_ID,
      BONUS_AMOUNT,
      PaymentType.MONEY_INCOME,
      '🎁 Бонусные звезды от администратора',
      {
        payment_method: 'Admin Bonus',
        category: 'BONUS',
        bot_name: 'admin_script',
        language: 'ru',
        service_type: 'bonus_credit',
      }
    )

    if (result) {
      console.log('✅ УСПЕШНО! Бонусные звезды добавлены!')
      console.log(`💎 Пользователь ${TELEGRAM_ID} получил ${BONUS_AMOUNT} звезд`)
      console.log('\n🎉 Готово!')
    } else {
      console.log('❌ ОШИБКА! Не удалось добавить бонусные звезды')
      console.log('Проверьте логи для подробностей')
    }
  } catch (error) {
    console.error('💥 Критическая ошибка:', error)
  }
}

// Запускаем скрипт
addBonusStars()
