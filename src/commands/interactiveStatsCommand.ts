/**
 * 📊 ИНТЕРАКТИВНАЯ КОМАНДА СТАТИСТИКИ С КНОПКАМИ
 * Упрощенный интерфейс для получения всех видов статистики
 */

import { Telegraf, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { ADMIN_IDS_ARRAY } from '@/config'
import { getBotStatsWithCost } from '@/core/supabase/getUserBalanceStats'
import { generateAdminExcelReport } from '@/utils/adminExcelReportGenerator'
import { supabase } from '@/core/supabase'
import { getOwnedBots } from '@/core/supabase/getOwnedBots'
import {
  analyzeTrends,
  generateSmartRecommendations,
  segmentUsers,
  TrendAnalysis,
  SmartRecommendations,
  UserSegmentation,
} from '@/utils/trendAnalysis'
import {
  generateAlertsForBot,
  generateWeeklySummary,
  formatAlertMessage,
  SmartAlert,
} from '@/utils/smartNotifications'
import fs from 'fs'
import path from 'path'

// Интерфейс для хранения состояния
interface StatsSession {
  botName: string
  period: 'today' | 'week' | 'month' | 'all'
  userId: string
}

// Хранилище сессий (в продакшене лучше использовать Redis)
const statsSessions = new Map<string, StatsSession>()

/**
 * Проверяет права доступа пользователя к боту
 */
async function checkBotAccess(
  userId: string,
  botName: string
): Promise<boolean> {
  const isAdmin = ADMIN_IDS_ARRAY.includes(parseInt(userId))

  if (isAdmin) {
    return true // Супер-админы имеют доступ ко всем ботам
  }

  const ownedBots = await getOwnedBots(userId)
  return ownedBots ? ownedBots.includes(botName) : false
}

/**
 * Главная команда /stats_menu - показывает интерактивное меню
 */
export async function interactiveStatsCommand(ctx: MyContext): Promise<void> {
  try {
    const userId = ctx.from?.id?.toString()
    if (!userId) {
      await ctx.reply('❌ Не удалось определить пользователя')
      return
    }

    // Проверяем права доступа
    const isAdmin = ADMIN_IDS_ARRAY.includes(parseInt(userId))
    const ownedBots = await getOwnedBots(userId)

    // Пользователь должен быть либо админом, либо владельцем ботов
    if (!isAdmin && (!ownedBots || ownedBots.length === 0)) {
      await ctx.reply('❌ У вас нет доступа к статистике ботов')
      return
    }

    const args =
      ctx.message && 'text' in ctx.message
        ? ctx.message.text.split(' ').slice(1)
        : []

    const botName = args[0]

    // Если бот не указан, показываем список доступных ботов
    if (!botName) {
      await showBotSelection(ctx, userId, isAdmin, ownedBots)
      return
    }

    // Проверяем права доступа к конкретному боту
    if (!isAdmin && ownedBots && !ownedBots.includes(botName)) {
      await ctx.reply(`❌ У вас нет доступа к боту @${botName}`)
      return
    }

    // Сохраняем сессию
    statsSessions.set(userId, {
      botName,
      period: 'all',
      userId,
    })

    await showStatsMenu(ctx, botName, 'all')
  } catch (error) {
    console.error('❌ Ошибка в interactiveStatsCommand:', error)
    await ctx.reply('❌ Произошла ошибка при показе статистики')
  }
}

/**
 * Показывает список доступных ботов для выбора
 */
async function showBotSelection(
  ctx: MyContext,
  userId: string,
  isAdmin: boolean,
  ownedBots: string[] | null
): Promise<void> {
  try {
    let availableBots: string[] = []

    if (isAdmin) {
      // Супер-админы видят всех ботов
      const { data: bots, error } = await supabase
        .from('avatars')
        .select('bot_name')
        .not('bot_name', 'is', null)
        .limit(50)

      if (error) throw error

      availableBots = Array.from(new Set(bots.map(b => b.bot_name)))
        .filter(bot => bot && bot.trim() !== '')
        .sort()
    } else {
      // Владельцы ботов видят только свои боты
      availableBots = ownedBots || []
    }

    if (availableBots.length === 0) {
      const message = isAdmin
        ? '❌ Не найдено ботов в системе'
        : '❌ У вас нет ботов для просмотра статистики'
      await ctx.reply(message)
      return
    }

    // Создаем кнопки для ботов (по 2 в ряд)
    const buttons = []
    for (let i = 0; i < availableBots.length; i += 2) {
      const row = []
      row.push(
        Markup.button.callback(
          `🤖 ${availableBots[i]}`,
          `select_bot:${availableBots[i]}`
        )
      )

      if (availableBots[i + 1]) {
        row.push(
          Markup.button.callback(
            `🤖 ${availableBots[i + 1]}`,
            `select_bot:${availableBots[i + 1]}`
          )
        )
      }
      buttons.push(row)
    }

    const keyboard = Markup.inlineKeyboard(buttons)

    const accessLevel = isAdmin ? '👑 Супер-админ' : '👤 Владелец ботов'
    await ctx.reply(
      `🤖 <b>Выберите бота для анализа:</b>\n\n` +
        `🔐 Уровень доступа: ${accessLevel}\n` +
        `📊 Доступно ботов: ${availableBots.length}\n` +
        `💡 Или используйте: <code>/stats_menu bot_name</code>`,
      {
        parse_mode: 'HTML',
        ...keyboard,
      }
    )
  } catch (error) {
    console.error('❌ Ошибка в showBotSelection:', error)
    await ctx.reply('❌ Ошибка при получении списка ботов')
  }
}

/**
 * Показывает главное меню статистики для выбранного бота
 */
async function showStatsMenu(
  ctx: MyContext,
  botName: string,
  period: string
): Promise<void> {
  try {
    // Получаем базовую статистику
    const stats = await getBotStatsWithCost(botName, period as any)

    let message = `📊 <b>Статистика @${botName}</b>\n⏰ Период: ${getPeriodName(
      period
    )}\n\n`

    // Показываем доходы по валютам только если они есть
    let hasFinancialData = false

    // Рублевые доходы - показываем только если есть
    if (stats.rub_income > 0 || stats.rub_income_transactions > 0) {
      message += `💰 <b>Рублевые доходы:</b>\n`
      message += `   📈 Доходы: ${stats.rub_income.toLocaleString()} ₽ (${
        stats.rub_income_transactions
      } операций)\n`
      if (stats.rub_outcome > 0) {
        message += `   📉 Расходы: ${stats.rub_outcome.toLocaleString()} ₽ (${
          stats.rub_outcome_transactions
        } операций)\n`
      }
      message += `   💎 Результат: ${stats.rub_net_result.toLocaleString()} ₽\n\n`
      hasFinancialData = true
    }

    // Звездные доходы - показываем только если есть
    if (stats.stars_income > 0 || stats.stars_income_transactions > 0) {
      message += `⭐ <b>Звездные доходы:</b>\n`
      message += `   📈 Доходы: ${stats.stars_income.toLocaleString()}⭐ (${
        stats.stars_income_transactions
      } операций)\n`
      if (stats.stars_outcome > 0) {
        message += `   📉 Расходы: ${stats.stars_outcome.toLocaleString()}⭐ (${
          stats.stars_outcome_transactions
        } операций)\n`
        message += `   🏭 Себестоимость: ${stats.stars_cost.toLocaleString()}⭐\n`
      }
      message += `   💎 Результат: ${stats.stars_net_result.toLocaleString()}⭐\n\n`
      hasFinancialData = true
    }

    // Общие финансовые показатели - только если есть данные
    if (hasFinancialData) {
      message += `💰 <b>Общие финансы:</b>\n`
      message += `   💵 Общий доход: ${stats.total_income.toLocaleString()}⭐\n`
      message += `   📉 Общий расход: ${stats.total_outcome.toLocaleString()}⭐\n`
      message += `   🏭 Себестоимость: ${stats.total_cost.toLocaleString()}⭐\n`
      message += `   💎 Прибыль: ${stats.net_profit.toLocaleString()}⭐\n`
      message += `   📊 Маржа: ${stats.profit_margin.toFixed(1)}%\n\n`
    }

    message += `👥 <b>Пользователи:</b>\n`
    message += `   Всего: ${stats.total_users}\n`
    message += `   Активных за месяц: ${stats.active_users_month}\n\n`

    message += `🔢 <b>Операции:</b>\n`
    message += `   Всего транзакций: ${stats.total_transactions}\n`
    message += `   Средний чек: ${stats.avg_transaction_value.toFixed(1)}⭐`

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📅 Сегодня', `period:today:${botName}`),
        Markup.button.callback('📅 Неделя', `period:week:${botName}`),
      ],
      [
        Markup.button.callback('📅 Месяц', `period:month:${botName}`),
        Markup.button.callback('📅 Все время', `period:all:${botName}`),
      ],
      [
        Markup.button.callback(
          '📈 Детальная разбивка',
          `detailed:${botName}:${period}`
        ),
        Markup.button.callback('📊 Excel отчет', `excel:${botName}:${period}`),
      ],
      [
        Markup.button.callback('🔍 Отладка данных', `debug:${botName}`),
        Markup.button.callback(
          '👥 Топ пользователи',
          `top_users:${botName}:${period}`
        ),
      ],
      [
        Markup.button.callback('📈 Тренды и прогнозы', `trends:${botName}`),
        Markup.button.callback(
          '💡 Умные рекомендации',
          `recommendations:${botName}`
        ),
      ],
      [
        Markup.button.callback(
          '👥 Сегменты пользователей',
          `segments:${botName}`
        ),
        Markup.button.callback('🎯 AI-Инсайты', `ai_insights:${botName}`),
      ],
      [
        Markup.button.callback('🔔 Уведомления', `alerts:${botName}`),
        Markup.button.callback(
          '📅 Еженедельная сводка',
          `weekly_summary:${botName}`
        ),
      ],
      [
        Markup.button.callback('🔄 Обновить', `refresh:${botName}:${period}`),
        Markup.button.callback('🤖 Другой бот', 'select_other_bot'),
      ],
    ])

    if (ctx.callbackQuery) {
      try {
        await ctx.editMessageText(message, {
          parse_mode: 'HTML',
          ...keyboard,
        })
      } catch (error) {
        // Если сообщение не изменилось, отправляем новое
        if (error.message?.includes('message is not modified')) {
          await ctx.reply(message, {
            parse_mode: 'HTML',
            ...keyboard,
          })
        } else {
          throw error // Пробрасываем другие ошибки
        }
      }
    } else {
      await ctx.reply(message, {
        parse_mode: 'HTML',
        ...keyboard,
      })
    }
  } catch (error) {
    console.error('❌ Ошибка в showStatsMenu:', error)
    await ctx.reply('❌ Ошибка при получении статистики')
  }
}

/**
 * Обработчик callback-запросов
 */
export function setupInteractiveStatsHandlers(bot: Telegraf<MyContext>): void {
  // Выбор бота
  bot.action(/^select_bot:(.+)$/, async ctx => {
    const botName = ctx.match[1]
    const userId = ctx.from?.id?.toString()

    if (!userId) return

    // Проверяем права доступа к боту
    const isAdmin = ADMIN_IDS_ARRAY.includes(parseInt(userId))
    const ownedBots = await getOwnedBots(userId)

    if (!isAdmin && ownedBots && !ownedBots.includes(botName)) {
      await ctx.answerCbQuery(`❌ У вас нет доступа к боту @${botName}`, {
        show_alert: true,
      })
      return
    }

    statsSessions.set(userId, {
      botName,
      period: 'all',
      userId,
    })

    await showStatsMenu(ctx, botName, 'all')
    await ctx.answerCbQuery(`Выбран бот: @${botName}`)
  })

  // Выбор другого бота
  bot.action('select_other_bot', async ctx => {
    const userId = ctx.from?.id?.toString()
    if (!userId) return

    const isAdmin = ADMIN_IDS_ARRAY.includes(parseInt(userId))
    const ownedBots = await getOwnedBots(userId)

    await showBotSelection(ctx, userId, isAdmin, ownedBots)
    await ctx.answerCbQuery('Выберите другого бота')
  })

  // Смена периода
  bot.action(/^period:(.+):(.+)$/, async ctx => {
    const period = ctx.match[1]
    const botName = ctx.match[2]
    const userId = ctx.from?.id?.toString()

    if (!userId) return

    // Проверяем права доступа к боту
    const hasAccess = await checkBotAccess(userId, botName)
    if (!hasAccess) {
      await ctx.answerCbQuery(`❌ У вас нет доступа к боту @${botName}`, {
        show_alert: true,
      })
      return
    }

    // Проверяем, не выбран ли уже этот период
    const session = statsSessions.get(userId)
    if (session && session.period === period) {
      await ctx.answerCbQuery(`Уже выбран период: ${getPeriodName(period)}`)
      return
    }

    // Обновляем сессию
    if (session) {
      session.period = period as any
      statsSessions.set(userId, session)
    }

    await showStatsMenu(ctx, botName, period)
    await ctx.answerCbQuery(`Период: ${getPeriodName(period)}`)
  })

  // Детальная разбивка
  bot.action(/^detailed:(.+):(.+)$/, async ctx => {
    const botName = ctx.match[1]
    const period = ctx.match[2]
    const userId = ctx.from?.id?.toString()

    if (!userId) return

    const hasAccess = await checkBotAccess(userId, botName)
    if (!hasAccess) {
      await ctx.answerCbQuery(`❌ У вас нет доступа к боту @${botName}`, {
        show_alert: true,
      })
      return
    }

    await ctx.answerCbQuery('Генерирую детальную разбивку...')
    await sendDetailedStats(ctx, botName, period)
  })

  // Excel отчет
  bot.action(/^excel:(.+):(.+)$/, async ctx => {
    const botName = ctx.match[1]
    const period = ctx.match[2]
    const userId = ctx.from?.id?.toString()

    if (!userId) return

    const hasAccess = await checkBotAccess(userId, botName)
    if (!hasAccess) {
      await ctx.answerCbQuery(`❌ У вас нет доступа к боту @${botName}`, {
        show_alert: true,
      })
      return
    }

    await ctx.answerCbQuery('Создаю Excel отчет...')
    await sendExcelReport(ctx, botName, period)
  })

  // Отладка данных
  bot.action(/^debug:(.+)$/, async ctx => {
    const botName = ctx.match[1]
    const userId = ctx.from?.id?.toString()

    if (!userId) return

    const hasAccess = await checkBotAccess(userId, botName)
    if (!hasAccess) {
      await ctx.answerCbQuery(`❌ У вас нет доступа к боту @${botName}`, {
        show_alert: true,
      })
      return
    }

    await ctx.answerCbQuery('Анализирую данные...')
    await sendDebugInfo(ctx, botName)
  })

  // Топ пользователи
  bot.action(/^top_users:(.+):(.+)$/, async ctx => {
    const botName = ctx.match[1]
    const period = ctx.match[2]
    const userId = ctx.from?.id?.toString()

    if (!userId) return

    const hasAccess = await checkBotAccess(userId, botName)
    if (!hasAccess) {
      await ctx.answerCbQuery(`❌ У вас нет доступа к боту @${botName}`, {
        show_alert: true,
      })
      return
    }

    await ctx.answerCbQuery('Получаю топ пользователей...')
    await sendTopUsers(ctx, botName, period)
  })

  // Тренды и прогнозы
  bot.action(/^trends:(.+)$/, async ctx => {
    const botName = ctx.match[1]
    const userId = ctx.from?.id?.toString()

    if (!userId) return

    const hasAccess = await checkBotAccess(userId, botName)
    if (!hasAccess) {
      await ctx.answerCbQuery(`❌ У вас нет доступа к боту @${botName}`, {
        show_alert: true,
      })
      return
    }

    await ctx.answerCbQuery('Анализирую тренды...')
    await sendTrendAnalysis(ctx, botName)
  })

  // Умные рекомендации
  bot.action(/^recommendations:(.+)$/, async ctx => {
    const botName = ctx.match[1]
    const userId = ctx.from?.id?.toString()

    if (!userId) return

    const hasAccess = await checkBotAccess(userId, botName)
    if (!hasAccess) {
      await ctx.answerCbQuery(`❌ У вас нет доступа к боту @${botName}`, {
        show_alert: true,
      })
      return
    }

    await ctx.answerCbQuery('Генерирую рекомендации...')
    await sendSmartRecommendations(ctx, botName)
  })

  // Сегменты пользователей
  bot.action(/^segments:(.+)$/, async ctx => {
    const botName = ctx.match[1]
    const userId = ctx.from?.id?.toString()

    if (!userId) return

    const hasAccess = await checkBotAccess(userId, botName)
    if (!hasAccess) {
      await ctx.answerCbQuery(`❌ У вас нет доступа к боту @${botName}`, {
        show_alert: true,
      })
      return
    }

    await ctx.answerCbQuery('Анализирую пользователей...')
    await sendUserSegmentation(ctx, botName)
  })

  // AI-Инсайты
  bot.action(/^ai_insights:(.+)$/, async ctx => {
    const botName = ctx.match[1]
    const userId = ctx.from?.id?.toString()

    if (!userId) return

    const hasAccess = await checkBotAccess(userId, botName)
    if (!hasAccess) {
      await ctx.answerCbQuery(`❌ У вас нет доступа к боту @${botName}`, {
        show_alert: true,
      })
      return
    }

    await ctx.answerCbQuery('Генерирую AI-инсайты...')
    await sendAIInsights(ctx, botName)
  })

  // Уведомления
  bot.action(/^alerts:(.+)$/, async ctx => {
    const botName = ctx.match[1]
    const userId = ctx.from?.id?.toString()

    if (!userId) return

    const hasAccess = await checkBotAccess(userId, botName)
    if (!hasAccess) {
      await ctx.answerCbQuery(`❌ У вас нет доступа к боту @${botName}`, {
        show_alert: true,
      })
      return
    }

    await ctx.answerCbQuery('Проверяю уведомления...')
    await sendAlerts(ctx, botName)
  })

  // Еженедельная сводка
  bot.action(/^weekly_summary:(.+)$/, async ctx => {
    const botName = ctx.match[1]
    const userId = ctx.from?.id?.toString()

    if (!userId) return

    const hasAccess = await checkBotAccess(userId, botName)
    if (!hasAccess) {
      await ctx.answerCbQuery(`❌ У вас нет доступа к боту @${botName}`, {
        show_alert: true,
      })
      return
    }

    await ctx.answerCbQuery('Генерирую сводку...')
    await sendWeeklySummaryReport(ctx, botName)
  })

  // Обновление
  bot.action(/^refresh:(.+):(.+)$/, async ctx => {
    const botName = ctx.match[1]
    const period = ctx.match[2]
    const userId = ctx.from?.id?.toString()

    if (!userId) return

    const hasAccess = await checkBotAccess(userId, botName)
    if (!hasAccess) {
      await ctx.answerCbQuery(`❌ У вас нет доступа к боту @${botName}`, {
        show_alert: true,
      })
      return
    }

    try {
      await showStatsMenu(ctx, botName, period)
      await ctx.answerCbQuery('Статистика обновлена')
    } catch (error) {
      // Если сообщение не изменилось, просто уведомляем пользователя
      if (error.message?.includes('message is not modified')) {
        await ctx.answerCbQuery('Статистика актуальна')
      } else {
        console.error('❌ Ошибка при обновлении статистики:', error)
        await ctx.answerCbQuery('Ошибка при обновлении')
      }
    }
  })
}

/**
 * Отправляет детальную статистику
 */
async function sendDetailedStats(
  ctx: MyContext,
  botName: string,
  period: string
): Promise<void> {
  try {
    const stats = await getBotStatsWithCost(botName, period as any)

    let message = `📈 <b>Детальная статистика @${botName}</b>\n⏰ Период: ${getPeriodName(
      period
    )}\n\n`

    // Показываем детализацию по валютам только если есть данные
    let hasFinancialData = false

    // Рублевые операции - показываем только если есть
    if (stats.rub_income > 0 || stats.rub_income_transactions > 0) {
      message += `💰 <b>Рублевые операции:</b>\n`
      message += `   📈 Доходы: ${stats.rub_income.toLocaleString()} ₽ (${
        stats.rub_income_transactions
      } операций)\n`
      if (stats.rub_outcome > 0) {
        message += `   📉 Расходы: ${stats.rub_outcome.toLocaleString()} ₽ (${
          stats.rub_outcome_transactions
        } операций)\n`
      }
      message += `   💎 Результат: ${stats.rub_net_result.toLocaleString()} ₽\n\n`
      hasFinancialData = true
    }

    // Звездные операции - показываем только если есть
    if (stats.stars_income > 0 || stats.stars_income_transactions > 0) {
      message += `⭐ <b>Звездные операции:</b>\n`
      message += `   📈 Доходы: ${stats.stars_income.toLocaleString()}⭐ (${
        stats.stars_income_transactions
      } операций)\n`
      if (stats.stars_outcome > 0) {
        message += `   📉 Расходы: ${stats.stars_outcome.toLocaleString()}⭐ (${
          stats.stars_outcome_transactions
        } операций)\n`
        message += `   🏭 Себестоимость: ${stats.stars_cost.toLocaleString()}⭐\n`
      }
      message += `   💎 Результат: ${stats.stars_net_result.toLocaleString()}⭐\n\n`
      hasFinancialData = true
    }

    // Общие финансовые показатели - только если есть данные
    if (hasFinancialData) {
      message += `💰 <b>Общие финансовые показатели:</b>\n`
      message += `   💵 Общий доход: ${stats.total_income.toLocaleString()}⭐\n`
      message += `   📉 Общий расход: ${stats.total_outcome.toLocaleString()}⭐\n`
      message += `   🏭 Себестоимость: ${stats.total_cost.toLocaleString()}⭐\n`
      message += `   💎 Чистая прибыль: ${stats.net_profit.toLocaleString()}⭐\n`
      message += `   📊 Маржа прибыли: ${stats.profit_margin.toFixed(1)}%\n`
      message += `   📈 Доля себестоимости: ${stats.cost_percentage.toFixed(
        1
      )}%\n\n`
    }

    message +=
      `👥 <b>Пользовательские метрики:</b>\n` +
      `   👤 Всего пользователей: ${stats.total_users}\n` +
      `   🔥 Активных сегодня: ${stats.active_users_today}\n` +
      `   📅 Активных за неделю: ${stats.active_users_week}\n` +
      `   📆 Активных за месяц: ${stats.active_users_month}\n` +
      `   ✨ Новых сегодня: ${stats.new_users_today}\n` +
      `   📈 Новых за неделю: ${stats.new_users_week}\n` +
      `   📊 Новых за месяц: ${stats.new_users_month}\n\n` +
      `🔢 <b>Операционные метрики:</b>\n` +
      `   🔄 Всего транзакций: ${stats.total_transactions}\n` +
      `   📅 Транзакций сегодня: ${stats.transactions_today}\n` +
      `   📈 Транзакций за неделю: ${stats.transactions_week}\n` +
      `   📊 Транзакций за месяц: ${stats.transactions_month}\n` +
      `   💰 Средний чек: ${stats.avg_transaction_value.toFixed(1)}⭐\n\n` +
      `📈 <b>Показатели роста:</b>\n` +
      `   👥 Рост пользователей: ${stats.user_growth_rate.toFixed(1)}%\n` +
      `   💰 Рост выручки: ${stats.revenue_growth_rate.toFixed(1)}%\n` +
      `   🎯 Конверсия: ${stats.conversion_rate.toFixed(1)}%\n` +
      `   🔄 Удержание: ${stats.retention_rate.toFixed(1)}%`

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          '🔙 Назад к меню',
          `refresh:${botName}:${period}`
        ),
      ],
    ])

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...keyboard,
    })
  } catch (error) {
    console.error('❌ Ошибка в sendDetailedStats:', error)
    await ctx.reply('❌ Ошибка при получении детальной статистики')
  }
}

/**
 * Отправляет Excel отчет
 */
async function sendExcelReport(
  ctx: MyContext,
  botName: string,
  period: string
): Promise<void> {
  try {
    await ctx.reply(
      '📊 Создаю Excel отчет... Это может занять несколько секунд.'
    )

    const startTime = Date.now()
    const excelBuffer = await generateAdminExcelReport(botName)
    const generationTime = ((Date.now() - startTime) / 1000).toFixed(1)

    const fileName = `stats_${botName}_${period}_${
      new Date().toISOString().split('T')[0]
    }.xlsx`
    const fileSizeKB = Math.round(excelBuffer.length / 1024)

    const caption =
      `📊 <b>Excel отчет @${botName}</b>\n` +
      `⏰ Период: ${getPeriodName(period)}\n` +
      `📁 Размер: ${fileSizeKB} KB\n` +
      `⚡ Время генерации: ${generationTime} сек\n\n` +
      `📋 <b>Содержимое (6 листов):</b>\n` +
      `• 📊 Общая сводка\n` +
      `• 💰 Финансовая аналитика\n` +
      `• 🛠️ Анализ сервисов\n` +
      `• 👥 Топ пользователи\n` +
      `• 📅 Динамика по времени\n` +
      `• 📋 Все транзакции`

    await ctx.replyWithDocument(
      { source: excelBuffer, filename: fileName },
      {
        caption,
        parse_mode: 'HTML',
      }
    )

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          '🔙 Назад к меню',
          `refresh:${botName}:${period}`
        ),
      ],
    ])

    await ctx.reply('✅ Excel отчет готов!', keyboard)
  } catch (error) {
    console.error('❌ Ошибка в sendExcelReport:', error)
    await ctx.reply('❌ Ошибка при создании Excel отчета')
  }
}

/**
 * Отправляет информацию для отладки
 */
async function sendDebugInfo(ctx: MyContext, botName: string): Promise<void> {
  try {
    const { data: debugData } = await supabase
      .from('payments_v2')
      .select(
        'id, type, status, category, service_type, stars, cost, created_at'
      )
      .eq('bot_name', botName)
      .order('created_at', { ascending: false })
      .limit(10)

    if (!debugData || debugData.length === 0) {
      await ctx.reply('⚠️ Нет данных для отладки')
      return
    }

    let message = `🔍 <b>Отладка данных @${botName}</b>\n\n`
    message += `📊 Последние 10 транзакций:\n\n`

    debugData.forEach((payment, index) => {
      const date = new Date(payment.created_at).toLocaleDateString('ru-RU')
      message += `${index + 1}. ID: ${payment.id}\n`
      message += `   📅 ${date}\n`
      message += `   🔄 ${payment.type} | ${payment.status}\n`
      message += `   🏷️ ${payment.category || 'Нет'} | ${
        payment.service_type || 'Нет'
      }\n`
      message += `   💰 ${payment.stars}⭐ | Себестоимость: ${
        payment.cost || 0
      }⭐\n\n`
    })

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к меню', `refresh:${botName}:all`)],
    ])

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...keyboard,
    })
  } catch (error) {
    console.error('❌ Ошибка в sendDebugInfo:', error)
    await ctx.reply('❌ Ошибка при получении отладочной информации')
  }
}

/**
 * Отправляет топ пользователей
 */
export async function sendTopUsers(
  ctx: MyContext,
  botName: string,
  period: string
): Promise<void> {
  try {
    // Определяем временные рамки для периода
    let timeCondition = ''
    const now = new Date()

    switch (period) {
      case 'today': {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        timeCondition = `created_at >= '${today.toISOString()}'`
        break
      }
      case 'week': {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        timeCondition = `created_at >= '${weekAgo.toISOString()}'`
        break
      }
      case 'month': {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        timeCondition = `created_at >= '${monthAgo.toISOString()}'`
        break
      }
      case 'all':
      default:
        timeCondition = '' // Без ограничений по времени
        break
    }

    // Получаем топ пользователей по тратам за указанный период
    let query = supabase
      .from('payments_v2')
      .select('telegram_id, stars, type, created_at')
      .eq('bot_name', botName)
      .eq('status', 'COMPLETED')
      .eq('type', 'MONEY_OUTCOME')

    // Добавляем временное условие если нужно
    if (timeCondition) {
      query = query.gte('created_at', timeCondition.split("'")[1])
    }

    const { data: topUsers } = await query

    if (!topUsers || topUsers.length === 0) {
      await ctx.reply('⚠️ Нет данных о пользователях')
      return
    }

    // Группируем по пользователям
    const userSpending = new Map<string, number>()
    topUsers.forEach(payment => {
      // Приводим telegram_id к строке для консистентности
      const userId = payment.telegram_id.toString()
      const current = userSpending.get(userId) || 0
      userSpending.set(userId, current + (payment.stars || 0))
    })

    // Сортируем по тратам
    const sortedUsers = Array.from(userSpending.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)

    // Получаем информацию о пользователях из всей таблицы users (поиск по всем ботам)
    const userIds = sortedUsers.map(([id]) => id) // Уже строки

    // Сначала пробуем найти пользователей в таблице users
    const { data: usersInfo, error: usersError } = await supabase
      .from('users')
      .select('telegram_id, username, first_name, last_name, bot_name')
      .in('telegram_id', userIds)

    if (usersError) {
      console.error(
        '❌ Ошибка при получении информации о пользователях:',
        usersError
      )
    }

    // Создаем карту пользователей (может быть несколько записей для одного пользователя)
    const usersMap = new Map<string, any>()
    if (usersInfo) {
      usersInfo.forEach(user => {
        // Приводим telegram_id к строке для консистентности
        const userId = user.telegram_id.toString()
        const existingUser = usersMap.get(userId)
        // Если пользователь уже есть, обновляем только если новая запись более полная
        if (
          !existingUser ||
          (!existingUser.username && user.username) ||
          (!existingUser.first_name && user.first_name)
        ) {
          usersMap.set(userId, user)
        }
      })
    }

    let message = `👥 <b>Топ-10 пользователей @${botName}</b>\n`
    message += `⏰ Период: ${getPeriodName(period)}\n`
    message += `📊 Всего активных: ${sortedUsers.length} пользователей\n\n`

    sortedUsers.forEach(([userId, spending], index) => {
      const user = usersMap.get(userId)

      let name = 'Неизвестный пользователь'
      let username = 'Нет username'

      if (user) {
        name =
          `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
          'Без имени'
        username = user.username ? `@${user.username}` : 'Нет username'
      }

      message += `${index + 1}. <b>${name}</b>\n`
      message += `   👤 ID: ${userId}\n`
      message += `   📱 ${username}\n`
      message += `   💰 Потратил: ${spending.toLocaleString()}⭐\n\n`
    })

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          '🔙 Назад к меню',
          `refresh:${botName}:${period}`
        ),
      ],
    ])

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...keyboard,
    })
  } catch (error) {
    console.error('❌ Ошибка в sendTopUsers:', error)
    await ctx.reply('❌ Ошибка при получении топ пользователей')
  }
}

/**
 * Отправляет анализ трендов
 */
async function sendTrendAnalysis(
  ctx: MyContext,
  botName: string
): Promise<void> {
  try {
    const trends = await analyzeTrends(botName)

    let message = `📈 <b>Анализ трендов @${botName}</b>\n\n`

    // Прогноз доходов
    message += `🔮 <b>Прогноз доходов:</b>\n`
    if (trends.revenue_forecast.predicted_amount > 0) {
      const trendEmoji =
        trends.revenue_forecast.trend_direction === 'growing'
          ? '📈'
          : trends.revenue_forecast.trend_direction === 'declining'
          ? '📉'
          : '➡️'

      message += `   ${trendEmoji} Следующий месяц: ${trends.revenue_forecast.predicted_amount.toLocaleString()}⭐\n`
      message += `   📊 Рост: ${
        trends.revenue_forecast.growth_rate > 0 ? '+' : ''
      }${trends.revenue_forecast.growth_rate}%\n`
      message += `   🎯 Уверенность: ${trends.revenue_forecast.confidence_level}%\n\n`
    } else {
      message += `   ⚠️ Недостаточно данных для прогноза\n\n`
    }

    // Сезонность
    message += `📅 <b>Сезонность:</b>\n`
    message += `   🗓️ Лучший день: ${trends.seasonality.best_day_of_week}\n`
    message += `   ⏰ Пик активности: ${trends.seasonality.peak_activity_time}\n\n`

    // Алерты
    if (trends.alerts.length > 0) {
      message += `🚨 <b>Важные уведомления:</b>\n`
      trends.alerts.forEach((alert, index) => {
        const severityEmoji =
          alert.severity === 'high'
            ? '🔴'
            : alert.severity === 'medium'
            ? '🟡'
            : '🟢'
        message += `${index + 1}. ${severityEmoji} ${alert.message}\n`
        message += `   💡 ${alert.recommendation}\n\n`
      })
    }

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к меню', `refresh:${botName}:all`)],
    ])

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...keyboard,
    })
  } catch (error) {
    console.error('❌ Ошибка в sendTrendAnalysis:', error)
    await ctx.reply('❌ Ошибка при анализе трендов')
  }
}

/**
 * Отправляет умные рекомендации
 */
async function sendSmartRecommendations(
  ctx: MyContext,
  botName: string
): Promise<void> {
  try {
    const recommendations = await generateSmartRecommendations(botName)

    let message = `💡 <b>Умные рекомендации @${botName}</b>\n\n`

    // Оптимизация ценообразования
    if (recommendations.pricing_optimization.length > 0) {
      message += `💰 <b>Оптимизация цен:</b>\n`
      recommendations.pricing_optimization.forEach((item, index) => {
        message += `${index + 1}. <b>${item.service}</b>\n`
        message += `   💵 Средняя цена: ${item.current_avg_price}⭐\n`
        message += `   📝 Рекомендация: ${item.suggested_action}\n`
        message += `   📈 Эффект: ${item.expected_impact}\n\n`
      })
    }

    // Удержание пользователей
    message += `👥 <b>Удержание пользователей:</b>\n`
    if (recommendations.user_retention.at_risk_users > 0) {
      message += `   ⚠️ Пользователей под риском: ${recommendations.user_retention.at_risk_users}\n\n`
    }
    message += `   🎯 <b>Стратегии удержания:</b>\n`
    recommendations.user_retention.retention_strategies.forEach(
      (strategy, index) => {
        message += `   ${index + 1}. ${strategy}\n`
      }
    )
    message += `\n`

    // Возможности роста
    message += `🚀 <b>Возможности роста:</b>\n`
    if (recommendations.growth_opportunities.trending_services.length > 0) {
      message += `   📈 Растущие сервисы: ${recommendations.growth_opportunities.trending_services.join(
        ', '
      )}\n`
    }
    if (
      recommendations.growth_opportunities.underperforming_services.length > 0
    ) {
      message += `   📉 Недоиспользуемые: ${recommendations.growth_opportunities.underperforming_services.join(
        ', '
      )}\n`
    }
    message += `\n   💡 <b>Предложения:</b>\n`
    recommendations.growth_opportunities.expansion_suggestions.forEach(
      (suggestion, index) => {
        message += `   ${index + 1}. ${suggestion}\n`
      }
    )

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к меню', `refresh:${botName}:all`)],
    ])

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...keyboard,
    })
  } catch (error) {
    console.error('❌ Ошибка в sendSmartRecommendations:', error)
    await ctx.reply('❌ Ошибка при генерации рекомендаций')
  }
}

/**
 * Отправляет сегментацию пользователей
 */
async function sendUserSegmentation(
  ctx: MyContext,
  botName: string
): Promise<void> {
  try {
    const segmentation = await segmentUsers(botName)

    let message = `👥 <b>Сегментация пользователей @${botName}</b>\n\n`

    // Путь пользователя
    message += `🛤️ <b>Путь пользователя:</b>\n`
    message += `   ⏱️ До первой покупки: ${segmentation.user_journey.avg_time_to_first_purchase} дней\n`
    message += `   💰 Средняя ценность: ${segmentation.user_journey.avg_lifetime_value}⭐\n`
    message += `   📉 Отток: ${segmentation.user_journey.churn_rate}%\n`
    message += `   🎯 Популярный сервис: ${segmentation.user_journey.most_popular_first_service}\n\n`

    // Сегменты
    message += `📊 <b>Сегменты пользователей:</b>\n`
    segmentation.segments
      .filter(segment => segment.count > 0)
      .forEach(segment => {
        const segmentEmoji =
          {
            VIP: '💎',
            Regular: '👤',
            Occasional: '🔄',
            At_Risk: '⚠️',
            New: '✨',
          }[segment.name] || '👥'

        message += `\n${segmentEmoji} <b>${segment.name} (${segment.count} чел.)</b>\n`
        message += `   💰 Средний доход: ${segment.avg_revenue}⭐\n`
        message += `   📈 Удержание: ${segment.retention_rate}%\n`
        message += `   🎯 Действия: ${segment.recommended_actions
          .slice(0, 2)
          .join(', ')}\n`
      })

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к меню', `refresh:${botName}:all`)],
    ])

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...keyboard,
    })
  } catch (error) {
    console.error('❌ Ошибка в sendUserSegmentation:', error)
    await ctx.reply('❌ Ошибка при сегментации пользователей')
  }
}

/**
 * Отправляет AI-инсайты (комбинированный анализ)
 */
async function sendAIInsights(ctx: MyContext, botName: string): Promise<void> {
  try {
    await ctx.reply(
      '🤖 Генерирую комплексный AI-анализ... Это займет несколько секунд.'
    )

    const [trends, recommendations, segmentation] = await Promise.all([
      analyzeTrends(botName),
      generateSmartRecommendations(botName),
      segmentUsers(botName),
    ])

    let message = `🎯 <b>AI-Инсайты @${botName}</b>\n\n`

    // Ключевые выводы
    message += `🔍 <b>Ключевые выводы:</b>\n`

    // Анализ роста
    if (trends.revenue_forecast.growth_rate > 10) {
      message += `📈 Отличный рост доходов (+${trends.revenue_forecast.growth_rate}%)\n`
    } else if (trends.revenue_forecast.growth_rate < -10) {
      message += `📉 Снижение доходов (${trends.revenue_forecast.growth_rate}%)\n`
    } else {
      message += `➡️ Стабильные доходы (${trends.revenue_forecast.growth_rate}%)\n`
    }

    // Анализ пользователей
    const totalUsers = segmentation.segments.reduce(
      (sum, s) => sum + s.count,
      0
    )
    const vipUsers =
      segmentation.segments.find(s => s.name === 'VIP')?.count || 0
    const atRiskUsers =
      segmentation.segments.find(s => s.name === 'At_Risk')?.count || 0

    if (vipUsers > 0) {
      message += `💎 VIP-клиенты: ${vipUsers} из ${totalUsers} (${Math.round(
        (vipUsers / totalUsers) * 100
      )}%)\n`
    }
    if (atRiskUsers > 0) {
      message += `⚠️ Под риском оттока: ${atRiskUsers} пользователей\n`
    }

    // Топ рекомендация
    if (trends.alerts.length > 0) {
      const highPriorityAlert = trends.alerts.find(a => a.severity === 'high')
      if (highPriorityAlert) {
        message += `🚨 Приоритет: ${highPriorityAlert.recommendation}\n`
      }
    }

    message += `\n🎯 <b>Рекомендации на неделю:</b>\n`

    // Генерируем персонализированные рекомендации
    const weeklyRecommendations = generateWeeklyRecommendations(
      trends,
      recommendations,
      segmentation
    )
    weeklyRecommendations.forEach((rec, index) => {
      message += `${index + 1}. ${rec}\n`
    })

    // Прогноз
    message += `\n🔮 <b>Прогноз:</b>\n`
    if (trends.revenue_forecast.predicted_amount > 0) {
      message += `💰 Ожидаемый доход: ${trends.revenue_forecast.predicted_amount.toLocaleString()}⭐\n`
      message += `📊 Уверенность: ${trends.revenue_forecast.confidence_level}%\n`
    }
    message += `⏰ Лучшее время активности: ${trends.seasonality.peak_activity_time}\n`

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📈 Детали трендов', `trends:${botName}`),
        Markup.button.callback('💡 Рекомендации', `recommendations:${botName}`),
      ],
      [
        Markup.button.callback('👥 Сегменты', `segments:${botName}`),
        Markup.button.callback('🔙 Назад к меню', `refresh:${botName}:all`),
      ],
    ])

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...keyboard,
    })
  } catch (error) {
    console.error('❌ Ошибка в sendAIInsights:', error)
    await ctx.reply('❌ Ошибка при генерации AI-инсайтов')
  }
}

/**
 * Генерирует персонализированные рекомендации на неделю
 */
function generateWeeklyRecommendations(
  trends: TrendAnalysis,
  recommendations: SmartRecommendations,
  segmentation: UserSegmentation
): string[] {
  const recs: string[] = []

  // Рекомендации на основе трендов
  if (trends.revenue_forecast.trend_direction === 'declining') {
    recs.push('🎯 Запустите акцию для стимулирования продаж')
  } else if (trends.revenue_forecast.trend_direction === 'growing') {
    recs.push('📈 Масштабируйте успешные стратегии')
  }

  // Рекомендации на основе сегментов
  const atRiskUsers =
    segmentation.segments.find(s => s.name === 'At_Risk')?.count || 0
  if (atRiskUsers > 0) {
    recs.push(
      `💌 Отправьте персональные предложения ${atRiskUsers} неактивным пользователям`
    )
  }

  const newUsers = segmentation.segments.find(s => s.name === 'New')?.count || 0
  if (newUsers > 0) {
    recs.push(`🎁 Создайте онбординг для ${newUsers} новых пользователей`)
  }

  // Рекомендации на основе времени
  recs.push(
    `⏰ Планируйте активности на ${trends.seasonality.best_day_of_week} в ${trends.seasonality.peak_activity_time}`
  )

  // Рекомендации по ценообразованию
  if (recommendations.pricing_optimization.length > 0) {
    const topService = recommendations.pricing_optimization[0]
    recs.push(
      `💰 Пересмотрите цены на "${
        topService.service
      }" - ${topService.suggested_action.toLowerCase()}`
    )
  }

  return recs.slice(0, 4) // Максимум 4 рекомендации
}

/**
 * Отправляет уведомления для бота
 */
async function sendAlerts(ctx: MyContext, botName: string): Promise<void> {
  try {
    const alerts = await generateAlertsForBot(botName)

    if (alerts.length === 0) {
      const message = `🔔 <b>Уведомления @${botName}</b>\n\n✅ Новых уведомлений нет!\n\nВсе показатели в норме.`

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Назад к меню', `refresh:${botName}:all`)],
      ])

      await ctx.reply(message, {
        parse_mode: 'HTML',
        ...keyboard,
      })
      return
    }

    // Группируем алерты по важности
    const criticalAlerts = alerts.filter(a => a.severity === 'critical')
    const warningAlerts = alerts.filter(a => a.severity === 'warning')
    const infoAlerts = alerts.filter(a => a.severity === 'info')
    const successAlerts = alerts.filter(a => a.severity === 'success')

    let message = `🔔 <b>Уведомления @${botName}</b>\n\n`

    // Критические алерты
    if (criticalAlerts.length > 0) {
      message += `🚨 <b>КРИТИЧЕСКИЕ (${criticalAlerts.length}):</b>\n`
      criticalAlerts.forEach((alert, index) => {
        message += `${index + 1}. ${alert.title}\n   ${alert.message}\n\n`
      })
    }

    // Предупреждения
    if (warningAlerts.length > 0) {
      message += `⚠️ <b>ПРЕДУПРЕЖДЕНИЯ (${warningAlerts.length}):</b>\n`
      warningAlerts.forEach((alert, index) => {
        message += `${index + 1}. ${alert.title}\n   ${alert.message}\n\n`
      })
    }

    // Успехи
    if (successAlerts.length > 0) {
      message += `✅ <b>ДОСТИЖЕНИЯ (${successAlerts.length}):</b>\n`
      successAlerts.forEach((alert, index) => {
        message += `${index + 1}. ${alert.title}\n   ${alert.message}\n\n`
      })
    }

    // Информационные
    if (infoAlerts.length > 0) {
      message += `ℹ️ <b>ИНФОРМАЦИЯ (${infoAlerts.length}):</b>\n`
      infoAlerts.forEach((alert, index) => {
        message += `${index + 1}. ${alert.title}\n   ${alert.message}\n\n`
      })
    }

    // Общие рекомендации
    const allRecommendations = alerts.flatMap(a => a.recommendations)
    if (allRecommendations.length > 0) {
      message += `💡 <b>Рекомендации:</b>\n`
      // Берем уникальные рекомендации
      const uniqueRecommendations = Array.from(new Set(allRecommendations))
      uniqueRecommendations.slice(0, 5).forEach((rec, index) => {
        message += `${index + 1}. ${rec}\n`
      })
    }

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к меню', `refresh:${botName}:all`)],
    ])

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...keyboard,
    })
  } catch (error) {
    console.error('❌ Ошибка в sendAlerts:', error)
    await ctx.reply('❌ Ошибка при получении уведомлений')
  }
}

/**
 * Отправляет еженедельную сводку
 */
async function sendWeeklySummaryReport(
  ctx: MyContext,
  botName: string
): Promise<void> {
  try {
    const summary = await generateWeeklySummary(botName)

    const message = `${formatAlertMessage(summary)}`

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📈 Детали трендов', `trends:${botName}`),
        Markup.button.callback('💡 Рекомендации', `recommendations:${botName}`),
      ],
      [
        Markup.button.callback('🔔 Уведомления', `alerts:${botName}`),
        Markup.button.callback('🔙 Назад к меню', `refresh:${botName}:all`),
      ],
    ])

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...keyboard,
    })
  } catch (error) {
    console.error('❌ Ошибка в sendWeeklySummaryReport:', error)
    await ctx.reply('❌ Ошибка при генерации еженедельной сводки')
  }
}

/**
 * Получает читаемое название периода
 */
function getPeriodName(period: string): string {
  switch (period) {
    case 'today':
      return 'Сегодня'
    case 'week':
      return 'Неделя'
    case 'month':
      return 'Месяц'
    case 'all':
      return 'Все время'
    default:
      return 'Все время'
  }
}

/**
 * Регистрация команды
 */
export function setupInteractiveStats(bot: Telegraf<MyContext>): void {
  bot.command('stats_menu', interactiveStatsCommand)
  setupInteractiveStatsHandlers(bot)
}
