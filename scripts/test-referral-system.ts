#!/usr/bin/env bun

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

// Загружаем .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL или SUPABASE_ANON_KEY не установлены в .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testReferralSystem() {
  console.log('🔍 Тестирование реферальной системы\n')

  // 1. Проверяем структуру таблицы users
  console.log('1️⃣ Проверка структуры таблицы users:')
  const { data: usersSchema, error: schemaError } = await supabase
    .from('users')
    .select('*')
    .limit(1)

  if (schemaError) {
    console.error('❌ Ошибка при получении схемы:', schemaError)
  } else if (usersSchema && usersSchema.length > 0) {
    const columns = Object.keys(usersSchema[0])
    console.log('✅ Колонки в таблице users:', columns.join(', '))
    console.log(
      '   Поле inviter:',
      columns.includes('inviter') ? '✅ Есть' : '❌ Отсутствует'
    )
  }

  // 2. Проверяем пользователей с рефералами
  console.log('\n2️⃣ Проверка пользователей с рефералами:')
  const { data: referrals, error: refError } = await supabase
    .from('users')
    .select('telegram_id, username, inviter')
    .not('inviter', 'is', null)
    .limit(10)

  if (refError) {
    console.error('❌ Ошибка при получении рефералов:', refError)
  } else {
    console.log(
      `✅ Найдено пользователей с рефералами: ${referrals?.length || 0}`
    )
    if (referrals && referrals.length > 0) {
      console.log('\nПримеры:')
      referrals.slice(0, 5).forEach(r => {
        console.log(
          `  - @${r.username} (ID: ${r.telegram_id}) приглашен пользователем с UUID: ${r.inviter}`
        )
      })
    }
  }

  // 3. Проверяем количество рефералов у конкретных пользователей
  console.log('\n3️⃣ Топ пригласителей:')

  // Получаем всех пользователей и считаем рефералов
  const { data: allUsers, error: allError } = await supabase
    .from('users')
    .select('id, telegram_id, username, inviter')

  if (allError) {
    console.error('❌ Ошибка при получении всех пользователей:', allError)
  } else if (allUsers) {
    // Подсчитываем рефералов для каждого пользователя
    const referralCounts: Record<
      string,
      { count: number; username?: string; telegram_id?: string }
    > = {}

    allUsers.forEach(user => {
      if (user.inviter) {
        if (!referralCounts[user.inviter]) {
          referralCounts[user.inviter] = { count: 0 }
        }
        referralCounts[user.inviter].count++
      }
    })

    // Добавляем информацию о пользователях
    for (const userId of Object.keys(referralCounts)) {
      const inviter = allUsers.find(u => u.id === userId)
      if (inviter) {
        referralCounts[userId].username = inviter.username
        referralCounts[userId].telegram_id = inviter.telegram_id
      }
    }

    // Сортируем по количеству рефералов
    const topInviters = Object.entries(referralCounts)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)

    if (topInviters.length > 0) {
      console.log('✅ Топ пригласителей:')
      topInviters.forEach(([userId, data], index) => {
        console.log(
          `  ${index + 1}. @${data.username || 'unknown'} (TG ID: ${data.telegram_id || 'unknown'}) - ${data.count} рефералов`
        )
      })
    } else {
      console.log('❌ Нет пользователей с рефералами')
    }
  }

  // 4. Проверяем функцию getReferalsCountAndUserData
  console.log('\n4️⃣ Тест функции getReferalsCountAndUserData:')
  const testTelegramId = '144022504' // Ваш telegram_id для теста

  const { data: testUser } = await supabase
    .from('users')
    .select('id')
    .eq('telegram_id', testTelegramId)
    .single()

  if (testUser) {
    const { data: testReferrals } = await supabase
      .from('users')
      .select('telegram_id')
      .eq('inviter', testUser.id)

    console.log(
      `✅ Пользователь ${testTelegramId} имеет ${testReferrals?.length || 0} рефералов`
    )
  } else {
    console.log(`❌ Пользователь ${testTelegramId} не найден`)
  }

  // 5. Проверяем последних зарегистрированных пользователей
  console.log('\n5️⃣ Последние 5 зарегистрированных пользователей:')
  const { data: lastUsers, error: lastError } = await supabase
    .from('users')
    .select('telegram_id, username, inviter, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  if (lastError) {
    console.error('❌ Ошибка:', lastError)
  } else if (lastUsers) {
    lastUsers.forEach(u => {
      const inviterInfo = u.inviter
        ? `✅ Есть реферал (${u.inviter.substring(0, 8)}...)`
        : '❌ Без реферала'
      console.log(
        `  - @${u.username} (${u.telegram_id}) - ${inviterInfo} - ${new Date(u.created_at).toLocaleString()}`
      )
    })
  }
}

// Запускаем тест
testReferralSystem()
  .then(() => {
    console.log('\n✅ Тестирование завершено')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n❌ Ошибка при тестировании:', error)
    process.exit(1)
  })
