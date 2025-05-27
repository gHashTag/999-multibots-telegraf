import { describe, it, expect } from 'vitest'
import { supabase } from '@/core/supabase/client'

describe('New Users Calculation Debug', () => {
  const BOT_NAME = 'MetaMuse_Manifest_bot'

  it('должен найти и проанализировать проблему с новыми пользователями', async () => {
    console.log('🔍 Детальная диагностика расчета новых пользователей...')

    // 1. Получаем всех пользователей
    const { data: allUsers, error: allUsersError } = await supabase
      .from('users')
      .select('telegram_id, username, first_name, created_at')
      .eq('bot_name', BOT_NAME)
      .order('created_at', { ascending: false })

    if (allUsersError) {
      console.error('❌ Ошибка получения всех пользователей:', allUsersError)
      throw allUsersError
    }

    console.log(`👥 Всего пользователей: ${allUsers?.length || 0}`)

    if (!allUsers || allUsers.length === 0) {
      console.log('❌ Пользователи не найдены!')
      return
    }

    // 2. Анализируем даты
    const now = new Date()
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    console.log(`📅 Временные рамки:`)
    console.log(`   Сейчас: ${now.toISOString()}`)
    console.log(`   Месяц назад: ${oneMonthAgo.toISOString()}`)
    console.log(`   Неделя назад: ${oneWeekAgo.toISOString()}`)
    console.log(`   День назад: ${oneDayAgo.toISOString()}`)

    // 3. Ручной подсчет новых пользователей
    const newUsersMonth = allUsers.filter(user => {
      const userDate = new Date(user.created_at)
      return userDate >= oneMonthAgo
    })

    const newUsersWeek = allUsers.filter(user => {
      const userDate = new Date(user.created_at)
      return userDate >= oneWeekAgo
    })

    const newUsersDay = allUsers.filter(user => {
      const userDate = new Date(user.created_at)
      return userDate >= oneDayAgo
    })

    console.log(`📊 Ручной подсчет новых пользователей:`)
    console.log(`   За месяц: ${newUsersMonth.length}`)
    console.log(`   За неделю: ${newUsersWeek.length}`)
    console.log(`   За день: ${newUsersDay.length}`)

    // 4. Проверяем SQL-запросы как в функции getDetailedBotStats
    console.log(`🔍 Проверяем SQL-запросы...`)

    // Запрос за месяц
    const { data: sqlNewUsersMonth, error: monthError } = await supabase
      .from('users')
      .select('telegram_id, username, created_at')
      .eq('bot_name', BOT_NAME)
      .gte('created_at', oneMonthAgo.toISOString())

    if (monthError) {
      console.error('❌ Ошибка SQL за месяц:', monthError)
    } else {
      console.log(
        `📅 SQL за месяц: ${sqlNewUsersMonth?.length || 0} пользователей`
      )
    }

    // Запрос за неделю
    const { data: sqlNewUsersWeek, error: weekError } = await supabase
      .from('users')
      .select('telegram_id, username, created_at')
      .eq('bot_name', BOT_NAME)
      .gte('created_at', oneWeekAgo.toISOString())

    if (weekError) {
      console.error('❌ Ошибка SQL за неделю:', weekError)
    } else {
      console.log(
        `📅 SQL за неделю: ${sqlNewUsersWeek?.length || 0} пользователей`
      )
    }

    // 5. Показываем последних пользователей с детальным анализом
    console.log(`👥 Анализ последних 10 пользователей:`)
    allUsers.slice(0, 10).forEach((user, index) => {
      const userDate = new Date(user.created_at)
      const daysAgo =
        (now.getTime() - userDate.getTime()) / (24 * 60 * 60 * 1000)
      const isNewMonth = userDate >= oneMonthAgo
      const isNewWeek = userDate >= oneWeekAgo
      const isNewDay = userDate >= oneDayAgo

      console.log(
        `   ${index + 1}. ${user.username || user.first_name || user.telegram_id}`
      )
      console.log(`      Дата: ${user.created_at}`)
      console.log(`      Дней назад: ${daysAgo.toFixed(1)}`)
      console.log(`      Новый за месяц: ${isNewMonth ? '✅' : '❌'}`)
      console.log(`      Новый за неделю: ${isNewWeek ? '✅' : '❌'}`)
      console.log(`      Новый за день: ${isNewDay ? '✅' : '❌'}`)
      console.log(`      ---`)
    })

    // 6. Проверяем возможные проблемы с временными зонами
    console.log(`🕐 Проверка временных зон:`)
    if (allUsers.length > 0) {
      const firstUser = allUsers[0]
      const userDateRaw = firstUser.created_at
      const userDate = new Date(userDateRaw)

      console.log(`   Raw дата: ${userDateRaw}`)
      console.log(`   Parsed дата: ${userDate.toISOString()}`)
      console.log(`   Local дата: ${userDate.toString()}`)
      console.log(`   UTC дата: ${userDate.toUTCString()}`)
      console.log(`   Timestamp: ${userDate.getTime()}`)
      console.log(`   Сейчас timestamp: ${now.getTime()}`)
      console.log(`   Разница: ${now.getTime() - userDate.getTime()} ms`)
    }

    // 7. Тестируем разные форматы дат
    console.log(`📝 Тестируем разные форматы дат:`)
    const testDates = [
      oneMonthAgo.toISOString(),
      oneMonthAgo.toISOString().slice(0, -1), // без Z
      oneMonthAgo.toISOString().slice(0, 19), // без миллисекунд и Z
      oneMonthAgo.toISOString().slice(0, 10), // только дата
    ]

    for (const testDate of testDates) {
      const { data: testResult, error: testError } = await supabase
        .from('users')
        .select('telegram_id')
        .eq('bot_name', BOT_NAME)
        .gte('created_at', testDate)

      if (testError) {
        console.log(`   ❌ Формат "${testDate}": ошибка - ${testError.message}`)
      } else {
        console.log(
          `   ✅ Формат "${testDate}": ${testResult?.length || 0} пользователей`
        )
      }
    }

    // Тест должен пройти
    expect(allUsers.length).toBeGreaterThan(0)
  })

  it('должен проверить активных пользователей', async () => {
    console.log('🟢 Проверяем расчет активных пользователей...')

    const now = new Date()
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Получаем активных пользователей за месяц (те, кто делал транзакции)
    const { data: activeUsers, error } = await supabase
      .from('payments_v2')
      .select('telegram_id, created_at')
      .eq('bot_name', BOT_NAME)
      .eq('status', 'COMPLETED')
      .gte('created_at', oneMonthAgo.toISOString())

    if (error) {
      console.error('❌ Ошибка получения активных пользователей:', error)
      throw error
    }

    // Уникальные пользователи
    const uniqueActiveUsers = new Set(
      activeUsers?.map(p => p.telegram_id) || []
    )

    console.log(`🟢 Активные пользователи за месяц:`)
    console.log(`   Всего транзакций: ${activeUsers?.length || 0}`)
    console.log(`   Уникальных пользователей: ${uniqueActiveUsers.size}`)

    if (activeUsers && activeUsers.length > 0) {
      console.log(`📅 Последние активности:`)
      activeUsers.slice(0, 5).forEach((payment, index) => {
        console.log(
          `   ${index + 1}. User ${payment.telegram_id} - ${payment.created_at}`
        )
      })
    }

    expect(true).toBe(true) // Тест для логирования
  })
})
