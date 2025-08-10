#!/usr/bin/env node

/**
 * Скрипт для массового назначения реферера всем пользователям определенного бота
 * Использование: node scripts/assign-mass-referrals.js <referrer_telegram_id> <bot_name>
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

// Настройка Supabase
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function assignMassReferrals(referrerTelegramId, botName) {
  console.log(`🚀 МАССОВОЕ НАЗНАЧЕНИЕ РЕФЕРЕРА`)
  console.log(`👤 Реферер: ${referrerTelegramId}`)
  console.log(`🤖 Бот: ${botName}`)
  console.log('=' * 60)

  try {
    // 1. Проверяем существование реферера
    console.log('\n🔍 1. Проверка реферера...')
    const { data: referrerData, error: referrerError } = await supabase
      .from('users')
      .select('user_id, username, first_name, bot_name')
      .eq('telegram_id', referrerTelegramId.toString())
      .maybeSingle()

    if (referrerError) {
      console.error('❌ Ошибка при поиске реферера:', referrerError.message)
      return
    }

    if (!referrerData) {
      console.error('❌ Реферер не найден в базе данных')
      return
    }

    console.log('✅ Реферер найден:')
    console.log(`   • ID в БД: ${referrerData.user_id}`)
    console.log(`   • Username: ${referrerData.username || 'НЕТ'}`)
    console.log(`   • Имя: ${referrerData.first_name || 'НЕТ'}`)
    console.log(`   • Бот реферера: ${referrerData.bot_name || 'НЕТ'}`)

    // 2. Получаем всех пользователей целевого бота
    console.log(`\n👥 2. Поиск пользователей бота "${botName}"...`)
    const { data: botUsers, error: botUsersError, count } = await supabase
      .from('users')
      .select('user_id, telegram_id, username, first_name, inviter', { count: 'exact' })
      .eq('bot_name', botName)

    if (botUsersError) {
      console.error('❌ Ошибка при получении пользователей бота:', botUsersError.message)
      return
    }

    console.log(`📊 Найдено пользователей бота "${botName}": ${count || 0}`)

    if (!botUsers || botUsers.length === 0) {
      console.log('❌ Пользователи бота не найдены')
      return
    }

    // 3. Фильтруем пользователей (исключаем самого реферера и тех, у кого уже есть inviter)
    const usersToUpdate = botUsers.filter(user => {
      // Исключаем самого реферера
      if (user.telegram_id === referrerTelegramId.toString()) {
        return false
      }
      // Включаем только тех, у кого нет inviter или inviter равен null
      return !user.inviter
    })

    console.log(`\n🎯 3. Анализ пользователей для обновления:`)
    console.log(`   • Всего пользователей бота: ${botUsers.length}`)
    console.log(`   • Исключен реферер: ${botUsers.some(u => u.telegram_id === referrerTelegramId.toString()) ? 'ДА' : 'НЕТ'}`)
    console.log(`   • Уже имеют реферера: ${botUsers.filter(u => u.inviter).length}`)
    console.log(`   • Подлежат обновлению: ${usersToUpdate.length}`)

    if (usersToUpdate.length === 0) {
      console.log('✅ Все пользователи уже имеют реферера. Обновление не требуется.')
      return
    }

    // 4. Показываем первых 10 пользователей для подтверждения
    console.log(`\n📋 4. Примеры пользователей для обновления (первые 10):`)
    usersToUpdate.slice(0, 10).forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.username || user.first_name || user.telegram_id} (ID: ${user.telegram_id})`)
    })
    if (usersToUpdate.length > 10) {
      console.log(`   ... и еще ${usersToUpdate.length - 10} пользователей`)
    }

    // 5. Запрос подтверждения
    console.log(`\n⚠️  ВНИМАНИЕ: Будет обновлено ${usersToUpdate.length} записей!`)
    console.log(`   Всем этим пользователям будет назначен реферер: ${referrerTelegramId}`)
    
    // В продакшене здесь должен быть интерактивный запрос подтверждения
    // Для автоматизации пропускаем это и сразу выполняем
    
    // 6. Выполняем массовое обновление
    console.log(`\n🔄 5. Выполнение массового обновления...`)
    
    const userIdsToUpdate = usersToUpdate.map(user => user.user_id)
    
    const { data: updateResult, error: updateError } = await supabase
      .from('users')
      .update({ inviter: referrerData.user_id })
      .in('user_id', userIdsToUpdate)
      .select('user_id')

    if (updateError) {
      console.error('❌ Ошибка при обновлении:', updateError.message)
      return
    }

    console.log(`✅ Успешно обновлено записей: ${updateResult?.length || 0}`)

    // 7. Проверяем результат
    console.log(`\n🔍 6. Проверка результата...`)
    const { data: verificationData, error: verificationError, count: newCount } = await supabase
      .from('users')
      .select('user_id', { count: 'exact' })
      .eq('inviter', referrerData.user_id)

    if (verificationError) {
      console.error('❌ Ошибка при проверке:', verificationError.message)
      return
    }

    console.log(`📈 Новое количество рефералов у пользователя ${referrerTelegramId}: ${newCount || 0}`)

    console.log(`\n🎉 ОПЕРАЦИЯ ЗАВЕРШЕНА УСПЕШНО!`)
    console.log(`   • Обновлено пользователей: ${updateResult?.length || 0}`)
    console.log(`   • Общее количество рефералов: ${newCount || 0}`)

  } catch (error) {
    console.error('❌ Непредвиденная ошибка:', error.message)
    console.error('Stack trace:', error.stack)
  }
}

// Получаем параметры из аргументов командной строки
const referrerTelegramId = process.argv[2]
const botName = process.argv[3]

if (!referrerTelegramId || !botName) {
  console.error('❌ Использование: node scripts/assign-mass-referrals.js <referrer_telegram_id> <bot_name>')
  console.error('   Пример: node scripts/assign-mass-referrals.js 484954118 ai_stars_bot')
  process.exit(1)
}

// Запускаем операцию
assignMassReferrals(referrerTelegramId, botName)
  .then(() => {
    console.log('\n✅ Скрипт завершен')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Критическая ошибка:', error.message)
    process.exit(1)
  })
