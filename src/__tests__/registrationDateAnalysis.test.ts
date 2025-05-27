import { describe, it, expect } from 'vitest'
import { supabase } from '@/core/supabase/client'

describe('Registration Date Analysis', () => {
  const BOT_NAME = 'MetaMuse_Manifest_bot'

  it('должен найти способ определения даты регистрации пользователей', async () => {
    console.log(
      '🔍 Анализируем возможные способы определения даты регистрации...'
    )

    // 1. Проверяем, есть ли в payments_v2 первые транзакции пользователей
    const { data: payments, error: paymentsError } = await supabase
      .from('payments_v2')
      .select('telegram_id, created_at, type, description')
      .eq('bot_name', BOT_NAME)
      .order('created_at', { ascending: true })
      .limit(10)

    if (paymentsError) {
      console.error('❌ Ошибка получения платежей:', paymentsError)
      throw paymentsError
    }

    console.log('📅 Первые транзакции в системе:')
    payments.forEach((payment, index) => {
      console.log(
        `   ${index + 1}. User ${payment.telegram_id} - ${payment.created_at}`
      )
      console.log(`      Тип: ${payment.type}`)
      console.log(`      Описание: ${payment.description?.substring(0, 50)}...`)
    })

    // 2. Найдем первую транзакцию для каждого пользователя
    const { data: allPayments, error: allPaymentsError } = await supabase
      .from('payments_v2')
      .select('telegram_id, created_at')
      .eq('bot_name', BOT_NAME)
      .order('created_at', { ascending: true })

    if (allPaymentsError) {
      console.error('❌ Ошибка получения всех платежей:', allPaymentsError)
      throw allPaymentsError
    }

    // Группируем по пользователям и находим первую транзакцию
    const firstTransactionByUser = new Map<number, string>()
    allPayments.forEach(payment => {
      if (!firstTransactionByUser.has(payment.telegram_id)) {
        firstTransactionByUser.set(payment.telegram_id, payment.created_at)
      }
    })

    console.log(`\n📊 Анализ первых транзакций:`)
    console.log(
      `   👥 Уникальных пользователей с транзакциями: ${firstTransactionByUser.size}`
    )

    // Анализируем распределение по времени
    const now = new Date()
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    let newUsersMonth = 0
    let newUsersWeek = 0
    let newUsersDay = 0

    firstTransactionByUser.forEach(firstTransactionDate => {
      const transactionDate = new Date(firstTransactionDate)
      if (transactionDate >= oneMonthAgo) newUsersMonth++
      if (transactionDate >= oneWeekAgo) newUsersWeek++
      if (transactionDate >= oneDayAgo) newUsersDay++
    })

    console.log(`📅 Новые пользователи по первым транзакциям:`)
    console.log(`   📆 За месяц: ${newUsersMonth}`)
    console.log(`   📅 За неделю: ${newUsersWeek}`)
    console.log(`   🕐 За день: ${newUsersDay}`)

    // 3. Сравниваем с общим количеством пользователей
    const { data: allUsers, error: usersError } = await supabase
      .from('users')
      .select('telegram_id')
      .eq('bot_name', BOT_NAME)

    if (usersError) {
      console.error('❌ Ошибка получения пользователей:', usersError)
      throw usersError
    }

    console.log(`\n📊 Сравнение:`)
    console.log(`   👥 Всего пользователей в users: ${allUsers.length}`)
    console.log(
      `   💳 Пользователей с транзакциями: ${firstTransactionByUser.size}`
    )
    console.log(
      `   🤔 Пользователей без транзакций: ${allUsers.length - firstTransactionByUser.size}`
    )

    expect(allPayments.length).toBeGreaterThan(0)
    expect(firstTransactionByUser.size).toBeGreaterThan(0)
  })

  it('должен проанализировать проблему с telegram_id', async () => {
    console.log('🔍 Анализируем проблему с telegram_id...')

    // Получаем примеры telegram_id из обеих таблиц
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('telegram_id, username')
      .eq('bot_name', BOT_NAME)
      .limit(5)

    const { data: payments, error: paymentsError } = await supabase
      .from('payments_v2')
      .select('telegram_id')
      .eq('bot_name', BOT_NAME)
      .limit(5)

    if (usersError || paymentsError) {
      console.error('❌ Ошибка:', usersError || paymentsError)
      throw usersError || paymentsError
    }

    console.log('📋 telegram_id в таблице users:')
    users.forEach((user, index) => {
      console.log(
        `   ${index + 1}. ${user.username}: ${user.telegram_id} (тип: ${typeof user.telegram_id})`
      )
    })

    console.log('\n📋 telegram_id в таблице payments_v2:')
    payments.forEach((payment, index) => {
      console.log(
        `   ${index + 1}. ${payment.telegram_id} (тип: ${typeof payment.telegram_id})`
      )
    })

    // Проверяем, есть ли пересечения
    const userIds = new Set(users.map(u => u.telegram_id))
    const paymentIds = new Set(payments.map(p => p.telegram_id.toString()))

    console.log('\n🔍 Анализ пересечений:')
    console.log(`   👥 Уникальных ID в users: ${userIds.size}`)
    console.log(`   💳 Уникальных ID в payments: ${paymentIds.size}`)

    const intersection = new Set([...userIds].filter(id => paymentIds.has(id)))
    console.log(`   🤝 Пересечений: ${intersection.size}`)

    if (intersection.size === 0) {
      console.log(
        '❌ ПРОБЛЕМА: Нет пересечений между telegram_id в users и payments_v2!'
      )
      console.log('   Возможные причины:')
      console.log('   1. В users telegram_id хранится как UUID')
      console.log('   2. В payments_v2 telegram_id хранится как число')
      console.log('   3. Нужно найти связующее поле')
    }

    expect(true).toBe(true) // Тест для логирования
  })

  it('должен найти правильную связь между таблицами', async () => {
    console.log('🔍 Ищем правильную связь между users и payments_v2...')

    // Проверяем, есть ли поле chat_id в users, которое может соответствовать telegram_id в payments
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('telegram_id, chat_id, username, first_name')
      .eq('bot_name', BOT_NAME)
      .limit(5)

    if (usersError) {
      console.error('❌ Ошибка получения пользователей:', usersError)
      throw usersError
    }

    console.log('📋 Поля в users, которые могут быть связаны с telegram_id:')
    users.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.username || user.first_name}:`)
      console.log(
        `      telegram_id: ${user.telegram_id} (${typeof user.telegram_id})`
      )
      console.log(`      chat_id: ${user.chat_id} (${typeof user.chat_id})`)
    })

    // Проверяем, соответствуют ли chat_id из users telegram_id из payments
    const { data: payments, error: paymentsError } = await supabase
      .from('payments_v2')
      .select('telegram_id')
      .eq('bot_name', BOT_NAME)
      .in(
        'telegram_id',
        users.map(u => u.chat_id)
      )
      .limit(5)

    if (paymentsError) {
      console.error('❌ Ошибка получения платежей:', paymentsError)
      throw paymentsError
    }

    console.log(`\n🔍 Проверка связи chat_id (users) = telegram_id (payments):`)
    console.log(
      `   💳 Найдено платежей с соответствующими ID: ${payments.length}`
    )

    if (payments.length > 0) {
      console.log(
        '✅ НАЙДЕНА СВЯЗЬ: chat_id в users = telegram_id в payments_v2!'
      )
      payments.forEach((payment, index) => {
        console.log(
          `   ${index + 1}. telegram_id в payments: ${payment.telegram_id}`
        )
      })
    } else {
      console.log('❌ Связь не найдена через chat_id')
    }

    expect(true).toBe(true) // Тест для логирования
  })
})
