import { describe, it, expect, beforeAll } from 'vitest'
import { supabase } from '@/core/supabase/client'
import { getBotStatsWithCost } from '@/core/supabase/getUserBalanceStats'

describe('Stats Consistency Tests for MetaMuse_Manifest_bot', () => {
  const BOT_NAME = 'MetaMuse_Manifest_bot'
  let rawDatabaseData: any = {}

  beforeAll(async () => {
    // Получаем сырые данные из базы для сравнения
    console.log('🔍 Получаем сырые данные из базы данных...')

    // 1. Все пользователи бота
    const { data: allUsers, error: usersError } = await supabase
      .from('users')
      .select('telegram_id, username, first_name, created_at')
      .eq('bot_name', BOT_NAME)
      .order('created_at', { ascending: false })

    if (usersError) {
      console.error('❌ Ошибка получения пользователей:', usersError)
      throw usersError
    }

    // 2. Все транзакции бота
    const { data: allPayments, error: paymentsError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', BOT_NAME)
      .order('created_at', { ascending: false })

    if (paymentsError) {
      console.error('❌ Ошибка получения платежей:', paymentsError)
      throw paymentsError
    }

    rawDatabaseData = {
      allUsers: allUsers || [],
      allPayments: allPayments || [],
    }

    console.log(`📊 Получено из базы:`)
    console.log(`   👥 Пользователей: ${rawDatabaseData.allUsers.length}`)
    console.log(`   💳 Транзакций: ${rawDatabaseData.allPayments.length}`)
  })

  describe('🔍 Проверка сырых данных из базы', () => {
    it('должен найти пользователей в базе данных', () => {
      expect(rawDatabaseData.allUsers).toBeDefined()
      expect(rawDatabaseData.allUsers.length).toBeGreaterThan(0)
      console.log(`✅ Найдено ${rawDatabaseData.allUsers.length} пользователей`)
    })

    it('должен найти транзакции в базе данных', () => {
      expect(rawDatabaseData.allPayments).toBeDefined()
      expect(rawDatabaseData.allPayments.length).toBeGreaterThan(0)
      console.log(`✅ Найдено ${rawDatabaseData.allPayments.length} транзакций`)
    })

    it('должен показать распределение пользователей по датам регистрации', () => {
      const now = new Date()
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const newUsersMonth = rawDatabaseData.allUsers.filter(
        (user: any) => new Date(user.created_at) >= oneMonthAgo
      )
      const newUsersWeek = rawDatabaseData.allUsers.filter(
        (user: any) => new Date(user.created_at) >= oneWeekAgo
      )
      const newUsersDay = rawDatabaseData.allUsers.filter(
        (user: any) => new Date(user.created_at) >= oneDayAgo
      )

      console.log(`📅 Новые пользователи по периодам (ручной подсчет):`)
      console.log(`   📆 За месяц: ${newUsersMonth.length}`)
      console.log(`   📅 За неделю: ${newUsersWeek.length}`)
      console.log(`   🕐 За день: ${newUsersDay.length}`)

      // Показываем последних 5 пользователей
      console.log(`👥 Последние 5 зарегистрированных пользователей:`)
      rawDatabaseData.allUsers
        .slice(0, 5)
        .forEach((user: any, index: number) => {
          const userDate = new Date(user.created_at)
          const daysAgo =
            (now.getTime() - userDate.getTime()) / (24 * 60 * 60 * 1000)
          console.log(
            `   ${index + 1}. ${user.username || user.first_name || user.telegram_id}`
          )
          console.log(`      Дата: ${user.created_at}`)
          console.log(`      Дней назад: ${daysAgo.toFixed(1)}`)
        })

      expect(newUsersMonth.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('📊 Проверка функции getBotStatsWithCost', () => {
    it('должен корректно рассчитывать статистику за месяц', async () => {
      console.log('🧮 Тестируем расчет статистики за месяц...')

      const stats = await getBotStatsWithCost(BOT_NAME, 'month')

      expect(stats).toBeDefined()

      console.log(`📊 Результаты getBotStatsWithCost (месяц):`)
      console.log(`   👥 Всего пользователей: ${stats.total_users}`)
      console.log(`   ✨ Новых за месяц: ${stats.new_users_month}`)
      console.log(`   🟢 Активных за месяц: ${stats.active_users_month}`)
      console.log(`   💰 Общий доход: ${stats.total_income} ⭐`)
      console.log(`   💸 Общий расход: ${stats.total_outcome} ⭐`)
      console.log(`   🔢 Всего транзакций: ${stats.total_transactions}`)

      // Проверяем логичность данных
      expect(stats.total_users).toBe(rawDatabaseData.allUsers.length)

      // Новых пользователей не может быть больше общего количества
      expect(stats.new_users_month).toBeLessThanOrEqual(stats.total_users)

      // Активных не может быть больше общего количества
      expect(stats.active_users_month).toBeLessThanOrEqual(stats.total_users)
    })

    it('должен корректно рассчитывать статистику за все время', async () => {
      console.log('🧮 Тестируем расчет статистики за все время...')

      const stats = await getBotStatsWithCost(BOT_NAME, 'all')

      expect(stats).toBeDefined()

      console.log(`📊 Результаты getBotStatsWithCost (все время):`)
      console.log(`   👥 Всего пользователей: ${stats.total_users}`)
      console.log(`   ✨ Новых пользователей: ${stats.new_users_month}`)
      console.log(`   🟢 Активных пользователей: ${stats.active_users_month}`)
      console.log(`   💰 Общий доход: ${stats.total_income} ⭐`)
      console.log(`   💸 Общий расход: ${stats.total_outcome} ⭐`)

      // Проверяем соответствие с сырыми данными
      expect(stats.total_users).toBe(rawDatabaseData.allUsers.length)
    })

    it('должен правильно считать доходы и расходы', async () => {
      console.log('💰 Проверяем расчет доходов и расходов...')

      const stats = await getBotStatsWithCost(BOT_NAME, 'all')

      // Считаем вручную из сырых данных
      const completedPayments = rawDatabaseData.allPayments.filter(
        (p: any) => p.status === 'COMPLETED'
      )
      const totalIncomeManual = completedPayments
        .filter((p: any) => p.type === 'MONEY_INCOME')
        .reduce((sum: number, p: any) => sum + (p.stars || 0), 0)
      const totalExpensesManual = completedPayments
        .filter((p: any) => p.type === 'MONEY_OUTCOME')
        .reduce((sum: number, p: any) => sum + (p.stars || 0), 0)

      console.log(`💰 Ручной расчет:`)
      console.log(`   💵 Доходы: ${totalIncomeManual} ⭐`)
      console.log(`   💸 Расходы: ${totalExpensesManual} ⭐`)
      console.log(`📊 Функция вернула:`)
      console.log(`   💵 Доходы: ${stats.total_income} ⭐`)
      console.log(`   💸 Расходы: ${stats.total_outcome} ⭐`)

      // Проверяем соответствие
      expect(stats.total_income).toBe(totalIncomeManual)
      expect(stats.total_outcome).toBe(totalExpensesManual)
    })
  })

  describe('🔍 Диагностика проблем с новыми пользователями', () => {
    it('должен найти причину нулевых новых пользователей за месяц', async () => {
      console.log('🕵️ Ищем причину проблемы с новыми пользователями...')

      const now = new Date()
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      // Проверяем SQL-запрос, который использует функция
      const { data: newUsersFromSQL, error } = await supabase
        .from('users')
        .select('telegram_id, username, created_at')
        .eq('bot_name', BOT_NAME)
        .gte('created_at', oneMonthAgo.toISOString())

      if (error) {
        console.error('❌ Ошибка SQL-запроса:', error)
        throw error
      }

      console.log(`🔍 SQL-запрос новых пользователей за месяц:`)
      console.log(
        `   📅 Период: с ${oneMonthAgo.toISOString()} по ${now.toISOString()}`
      )
      console.log(
        `   👥 Найдено: ${newUsersFromSQL?.length || 0} пользователей`
      )

      if (newUsersFromSQL && newUsersFromSQL.length > 0) {
        console.log(
          `✅ Новые пользователи найдены! Проблема в функции getBotStatsWithCost`
        )
        newUsersFromSQL.slice(0, 3).forEach((user: any, index: number) => {
          console.log(
            `   ${index + 1}. ${user.username || user.telegram_id} - ${user.created_at}`
          )
        })
      } else {
        console.log(`❌ Новые пользователи не найдены. Проверяем формат дат...`)

        // Показываем последних пользователей с их датами
        const recentUsers = rawDatabaseData.allUsers.slice(0, 5)
        console.log(`📅 Последние пользователи и их даты:`)
        recentUsers.forEach((user: any, index: number) => {
          const userDate = new Date(user.created_at)
          const isRecent = userDate >= oneMonthAgo
          console.log(`   ${index + 1}. ${user.username || user.telegram_id}`)
          console.log(`      Дата: ${user.created_at}`)
          console.log(`      Parsed: ${userDate.toISOString()}`)
          console.log(`      Новый?: ${isRecent ? '✅' : '❌'}`)
        })
      }

      // Тест должен пройти, если мы нашли данные для анализа
      expect(rawDatabaseData.allUsers.length).toBeGreaterThan(0)
    })

    it('должен проверить корректность временных зон и форматов дат', () => {
      console.log('🕐 Проверяем форматы дат и временные зоны...')

      const now = new Date()
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      console.log(`⏰ Текущее время:`)
      console.log(`   Local: ${now.toString()}`)
      console.log(`   ISO: ${now.toISOString()}`)
      console.log(`   UTC: ${now.toUTCString()}`)

      console.log(`📅 Месяц назад:`)
      console.log(`   Local: ${oneMonthAgo.toString()}`)
      console.log(`   ISO: ${oneMonthAgo.toISOString()}`)
      console.log(`   UTC: ${oneMonthAgo.toUTCString()}`)

      // Проверяем первого пользователя
      if (rawDatabaseData.allUsers.length > 0) {
        const firstUser = rawDatabaseData.allUsers[0]
        const userDate = new Date(firstUser.created_at)

        console.log(`👤 Первый пользователь:`)
        console.log(`   Raw: ${firstUser.created_at}`)
        console.log(`   Parsed: ${userDate.toISOString()}`)
        console.log(
          `   Difference from now: ${now.getTime() - userDate.getTime()} ms`
        )
        console.log(
          `   Days ago: ${(now.getTime() - userDate.getTime()) / (24 * 60 * 60 * 1000)}`
        )
      }

      expect(true).toBe(true) // Тест для логирования
    })
  })
})
