#!/usr/bin/env node

/**
 * Скрипт для анализа рефералов конкретного пользователя
 * Использование: node scripts/check-user-referrals.js <telegram_id>
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

async function analyzeUserReferrals(telegramId) {
  console.log(`🔍 Анализ рефералов пользователя: ${telegramId}`)
  console.log('=' * 50)

  try {
    // 1. Получаем данные самого пользователя
    console.log('\n📊 1. Данные пользователя:')
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId.toString())
      .maybeSingle()

    if (userError) {
      console.error('❌ Ошибка при получении данных пользователя:', userError.message)
      return
    }

    if (!userData) {
      console.log('❌ Пользователь не найден в базе данных')
      return
    }

    console.log('✅ Пользователь найден:')
    console.log(`   • ID в БД: ${userData.user_id}`)
    console.log(`   • Username: ${userData.username}`)
    console.log(`   • Telegram ID: ${userData.telegram_id}`)
    console.log(`   • Имя: ${userData.first_name} ${userData.last_name || ''}`)
    console.log(`   • Дата создания: ${userData.created_at || 'НЕТ ДАННЫХ'}`)
    console.log(`   • Inviter: ${userData.inviter || 'НЕТ'}`)
    console.log(`   • Bot name: ${userData.bot_name || 'НЕТ'}`)

    // 2. Ищем всех рефералов этого пользователя
    console.log('\n👥 2. Рефералы пользователя:')
    const { data: referrals, error: referralsError, count } = await supabase
      .from('users')
      .select('*', { count: 'exact' })
      .eq('inviter', userData.user_id)

    if (referralsError) {
      console.error('❌ Ошибка при получении рефералов:', referralsError.message)
      return
    }

    console.log(`📈 Общее количество рефералов: ${count || 0}`)

    if (referrals && referrals.length > 0) {
      console.log('\n📋 Список рефералов:')
      referrals.forEach((referral, index) => {
        console.log(`   ${index + 1}. ${referral.username || referral.first_name || referral.telegram_id}`)
        console.log(`      • Telegram ID: ${referral.telegram_id}`)
        console.log(`      • Дата регистрации: ${referral.created_at || 'НЕТ ДАННЫХ'}`)
        console.log(`      • Bot name: ${referral.bot_name || 'НЕТ'}`)
        console.log('')
      })
    } else {
      console.log('❌ Рефералов не найдено')
    }

    // 3. Проверяем, является ли сам пользователь чьим-то рефералом
    console.log('\n🔗 3. Реферальная цепочка:')
    if (userData.inviter) {
      const { data: inviterData, error: inviterError } = await supabase
        .from('users')
        .select('telegram_id, username, first_name')
        .eq('user_id', userData.inviter)
        .maybeSingle()

      if (inviterData && !inviterError) {
        console.log(`✅ Пользователь был приглашен пользователем:`)
        console.log(`   • Telegram ID инвайтера: ${inviterData.telegram_id}`)
        console.log(`   • Username инвайтера: ${inviterData.username || inviterData.first_name || 'НЕТ'}`)
      } else {
        console.log(`❌ Данные инвайтера не найдены (ID: ${userData.inviter})`)
      }
    } else {
      console.log('❌ Пользователь не был приглашен (прямая регистрация)')
    }

    // 4. Статистика
    console.log('\n📊 4. Статистика:')
    console.log(`   • Является инвайтером: ${count > 0 ? 'ДА' : 'НЕТ'}`)
    console.log(`   • Количество рефералов: ${count || 0}`)
    console.log(`   • Является рефералом: ${userData.inviter ? 'ДА' : 'НЕТ'}`)

  } catch (error) {
    console.error('❌ Непредвиденная ошибка:', error.message)
  }
}

// Получаем telegram_id из аргументов командной строки
const telegramId = process.argv[2]

if (!telegramId) {
  console.error('❌ Использование: node scripts/check-user-referrals.js <telegram_id>')
  console.error('   Пример: node scripts/check-user-referrals.js 484954118')
  process.exit(1)
}

// Запускаем анализ
analyzeUserReferrals(telegramId)
  .then(() => {
    console.log('\n✅ Анализ завершен')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Ошибка выполнения:', error.message)
    process.exit(1)
  })
