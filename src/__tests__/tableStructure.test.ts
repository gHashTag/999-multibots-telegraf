import { describe, it, expect } from 'vitest'
import { supabase } from '@/core/supabase/client'

describe('Database Table Structure Analysis', () => {
  it('должен показать структуру таблицы users', async () => {
    console.log('🔍 Анализируем структуру таблицы users...')

    // Получаем несколько записей для анализа структуры
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .limit(3)

    if (error) {
      console.error('❌ Ошибка получения пользователей:', error)
      throw error
    }

    if (users && users.length > 0) {
      console.log('📋 Структура таблицы users:')
      const firstUser = users[0]
      Object.keys(firstUser).forEach(key => {
        console.log(`   ${key}: ${typeof firstUser[key]} = ${firstUser[key]}`)
      })

      console.log('\n👥 Примеры пользователей:')
      users.forEach((user, index) => {
        console.log(
          `   ${index + 1}. ${user.username || user.first_name || user.telegram_id}`
        )
        console.log(`      telegram_id: ${user.telegram_id}`)
        console.log(`      updated_at: ${user.updated_at}`)
        if (user.created_at) {
          console.log(`      created_at: ${user.created_at}`)
        }
      })
    }

    expect(users).toBeDefined()
    expect(users.length).toBeGreaterThan(0)
  })

  it('должен показать структуру таблицы payments_v2', async () => {
    console.log('🔍 Анализируем структуру таблицы payments_v2...')

    const { data: payments, error } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .limit(3)

    if (error) {
      console.error('❌ Ошибка получения платежей:', error)
      throw error
    }

    if (payments && payments.length > 0) {
      console.log('📋 Структура таблицы payments_v2:')
      const firstPayment = payments[0]
      Object.keys(firstPayment).forEach(key => {
        console.log(
          `   ${key}: ${typeof firstPayment[key]} = ${firstPayment[key]}`
        )
      })
    }

    expect(payments).toBeDefined()
    expect(payments.length).toBeGreaterThan(0)
  })

  it('должен найти поле для даты регистрации пользователей', async () => {
    console.log('🕵️ Ищем поле для даты регистрации...')

    // Проверяем разные возможные поля
    const possibleDateFields = [
      'created_at',
      'updated_at',
      'registration_date',
      'date_created',
    ]

    for (const field of possibleDateFields) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select(`telegram_id, ${field}`)
          .eq('bot_name', 'MetaMuse_Manifest_bot')
          .limit(1)

        if (!error && data && data.length > 0) {
          console.log(`✅ Поле "${field}" существует: ${data[0][field]}`)
        } else if (error) {
          console.log(`❌ Поле "${field}" не существует: ${error.message}`)
        }
      } catch (e) {
        console.log(`❌ Ошибка проверки поля "${field}": ${e}`)
      }
    }

    expect(true).toBe(true) // Тест для логирования
  })

  it.skip('должен проанализировать логику расчета новых пользователей в getBotStatsWithCost', async () => {
    console.log('🧮 Анализируем логику getBotStatsWithCost...')

    // Получаем статистику за разные периоды
    const periods: ('month' | 'week' | 'all')[] = ['month', 'week', 'all']

    for (const period of periods) {
      try {
        const { getBotStatsWithCost } = await import(
          '@/core/supabase/getUserBalanceStats'
        )
        const stats = await getBotStatsWithCost('MetaMuse_Manifest_bot', period)

        console.log(`📊 Статистика за ${period}:`)
        console.log(`   Всего пользователей: ${stats.total_users}`)
        console.log(`   Новых за месяц: ${stats.new_users_month}`)
        console.log(`   Новых за неделю: ${stats.new_users_week}`)
        console.log(`   Новых сегодня: ${stats.new_users_today}`)
        console.log(`   Активных за месяц: ${stats.active_users_month}`)
        console.log(`   ---`)
      } catch (error) {
        console.error(`❌ Ошибка получения статистики за ${period}:`, error)
      }
    }

    expect(true).toBe(true) // Тест для логирования
  })
})
