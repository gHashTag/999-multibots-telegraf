#!/usr/bin/env node

/**
 * Скрипт для диагностики пользователя и его моделей
 * Запуск: node scripts/checkUserModels.js <telegram_id>
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env' })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Отсутствуют SUPABASE_URL или SUPABASE_SERVICE_KEY в .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function checkUser(telegramId) {
  console.log(`🔍 Проверяем пользователя: ${telegramId}`)
  console.log('=' .repeat(60))

  // 1. Проверяем пользователя
  console.log('\n1️⃣ Проверка пользователя:')
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: false })

  if (userError) {
    console.error('❌ Ошибка при получении пользователя:', userError)
    return
  }

  if (!users || users.length === 0) {
    console.log('❌ Пользователь НЕ НАЙДЕН в таблице users')
  } else {
    console.log(`✅ Пользователь найден (${users.length} записей):`)
    users.forEach((user, idx) => {
      console.log(`  ${idx + 1}. ID: ${user.id}, Имя: ${user.first_name}, Username: ${user.username}, Создан: ${user.created_at}`)
    })
  }

  // 2. Проверяем модели
  console.log('\n2️⃣ Проверка моделей:')
  const { data: models, error: modelsError } = await supabase
    .from('model_trainings')
    .select('id, api, status, model_name, trigger_word, model_url, bot_name, created_at')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (modelsError) {
    console.error('❌ Ошибка при получении моделей:', modelsError)
    return
  }

  if (!models || models.length === 0) {
    console.log('❌ Модели НЕ НАЙДЕНЫ в таблице model_trainings')
  } else {
    console.log(`✅ Найдено ${models.length} моделей:`)
    models.forEach((model, idx) => {
      console.log(`  ${idx + 1}. API: ${model.api}, Статус: ${model.status}, Имя: ${model.model_name}, Бот: ${model.bot_name}, Создано: ${model.created_at}`)
    })

    // Группируем по API
    const bflModels = models.filter(m => m.api === 'bfl' && m.status === 'SUCCESS')
    const replicateModels = models.filter(m => m.api === 'replicate' && m.status === 'SUCCESS')

    console.log(`\n📊 Сводка:`)
    console.log(`  - BFL модели (SUCCESS): ${bflModels.length}`)
    console.log(`  - Replicate модели (SUCCESS): ${replicateModels.length}`)
  }

  // 3. Проверяем подписки (в payments_v2)
  console.log('\n3️⃣ Проверка подписок (payments_v2):')
  const { data: subscriptions, error: subError } = await supabase
    .from('payments_v2')
    .select('subscription_type, status, payment_date')
    .eq('telegram_id', telegramId)
    .eq('status', 'COMPLETED')
    .order('payment_date', { ascending: false })
    .limit(10)

  if (subError) {
    console.error('❌ Ошибка при получении подписок:', subError)
  } else if (!subscriptions || subscriptions.length === 0) {
    console.log('❌ Подписки НЕ НАЙДЕНЫ в payments_v2')
  } else {
    console.log(`✅ Найдено ${subscriptions.length} платежей:`)
    subscriptions.forEach((sub, idx) => {
      console.log(`  ${idx + 1}. Тип: ${sub.subscription_type}, Статус: ${sub.status}, Дата: ${sub.payment_date}`)
    })
  }

  // 4. Проверяем баланс через функцию getUserBalance
  console.log('\n4️⃣ Проверка баланса:')
  try {
    const { getUserBalance } = await import('../src/core/supabase/getUserBalance.ts')
    const balance = await getUserBalance(telegramId)
    console.log(`✅ Баланс: ${balance} звезд`)
  } catch (balError) {
    console.error('❌ Ошибка при получении баланса:', balError.message)
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ Диагностика завершена')
}

// Получаем telegram_id из аргументов
const telegramId = process.argv[2] || '144022504'

checkUser(telegramId)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Критическая ошибка:', error)
    process.exit(1)
  })
