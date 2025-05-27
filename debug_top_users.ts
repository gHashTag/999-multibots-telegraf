/**
 * 🔍 ОТЛАДКА ТОП ПОЛЬЗОВАТЕЛЕЙ
 * Проверяем, почему пользователи не найдены в таблице users
 */

import { supabase } from './src/core/supabase'

async function debugTopUsers() {
  console.log('🔍 ОТЛАДКА ТОП ПОЛЬЗОВАТЕЛЕЙ\n')

  // Тестовые ID пользователей из вашего примера
  const testUserIds = [
    '435572800',
    '793916476',
    '89962285',
    '324420051',
    '425824587',
    '386875143',
    '306058143',
  ]

  console.log('📊 Проверяем пользователей:', testUserIds.join(', '))

  // 1. Проверяем, есть ли эти пользователи в таблице users
  console.log('\n1️⃣ ПОИСК В ТАБЛИЦЕ USERS:')
  const { data: usersData, error: usersError } = await supabase
    .from('users')
    .select('telegram_id, username, first_name, last_name, bot_name')
    .in('telegram_id', testUserIds)

  if (usersError) {
    console.error('❌ Ошибка:', usersError)
  } else {
    console.log(`✅ Найдено записей: ${usersData?.length || 0}`)
    usersData?.forEach(user => {
      console.log(`   👤 ID: ${user.telegram_id}`)
      console.log(`   📱 Username: ${user.username || 'НЕТ'}`)
      console.log(
        `   👨 Имя: ${user.first_name || 'НЕТ'} ${user.last_name || ''}`
      )
      console.log(`   🤖 Бот: ${user.bot_name}`)
      console.log()
    })
  }

  // 2. Проверяем, есть ли эти пользователи в payments_v2 для Gaia_Kamskaia_bot
  console.log('\n2️⃣ ПОИСК В ТАБЛИЦЕ PAYMENTS_V2 (Gaia_Kamskaia_bot):')
  const { data: paymentsData, error: paymentsError } = await supabase
    .from('payments_v2')
    .select('telegram_id, type, stars, bot_name')
    .eq('bot_name', 'Gaia_Kamskaia_bot')
    .eq('status', 'COMPLETED')
    .eq('type', 'MONEY_OUTCOME')
    .in('telegram_id', testUserIds)
    .limit(20)

  if (paymentsError) {
    console.error('❌ Ошибка:', paymentsError)
  } else {
    console.log(`✅ Найдено транзакций: ${paymentsData?.length || 0}`)

    // Группируем по пользователям
    const userSpending = new Map<string, number>()
    paymentsData?.forEach(payment => {
      const current = userSpending.get(payment.telegram_id) || 0
      userSpending.set(payment.telegram_id, current + (payment.stars || 0))
    })

    Array.from(userSpending.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([userId, spending]) => {
        console.log(`   💰 ID: ${userId} - потратил ${spending}⭐`)
      })
  }

  // 3. Проверяем, есть ли эти пользователи в других ботах
  console.log('\n3️⃣ ПОИСК В ДРУГИХ БОТАХ:')
  const { data: allUsersData, error: allUsersError } = await supabase
    .from('users')
    .select('telegram_id, username, first_name, last_name, bot_name')
    .in('telegram_id', testUserIds)

  if (allUsersError) {
    console.error('❌ Ошибка:', allUsersError)
  } else {
    console.log(`✅ Всего записей во всех ботах: ${allUsersData?.length || 0}`)

    // Группируем по ботам
    const botUsers = new Map<string, any[]>()
    allUsersData?.forEach(user => {
      const botName = user.bot_name || 'unknown'
      if (!botUsers.has(botName)) {
        botUsers.set(botName, [])
      }
      botUsers.get(botName)?.push(user)
    })

    botUsers.forEach((users, botName) => {
      console.log(`\n   🤖 Бот: ${botName} (${users.length} пользователей)`)
      users.forEach(user => {
        console.log(
          `      👤 ${user.telegram_id}: ${user.first_name || 'НЕТ'} (@${user.username || 'НЕТ'})`
        )
      })
    })
  }

  // 4. Проверяем общую статистику по таблице users
  console.log('\n4️⃣ ОБЩАЯ СТАТИСТИКА ТАБЛИЦЫ USERS:')
  const { data: statsData, error: statsError } = await supabase
    .from('users')
    .select('bot_name, telegram_id')
    .limit(1000)

  if (statsError) {
    console.error('❌ Ошибка:', statsError)
  } else {
    const botStats = new Map<string, number>()
    statsData?.forEach(user => {
      const botName = user.bot_name || 'unknown'
      botStats.set(botName, (botStats.get(botName) || 0) + 1)
    })

    console.log(`✅ Всего пользователей в БД: ${statsData?.length || 0}`)
    console.log('\n📊 Распределение по ботам:')
    Array.from(botStats.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([botName, count]) => {
        console.log(`   🤖 ${botName}: ${count} пользователей`)
      })
  }

  console.log('\n🎯 ВЫВОДЫ:')
  console.log(
    '1. Если пользователи не найдены в таблице users - они не регистрировались'
  )
  console.log('2. Если найдены в других ботах - нужно искать по всем ботам')
  console.log(
    '3. Если есть транзакции но нет в users - проблема с регистрацией'
  )
}

// Запускаем отладку
debugTopUsers().catch(console.error)
