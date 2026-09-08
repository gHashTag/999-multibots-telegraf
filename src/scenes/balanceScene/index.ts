import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { getUserBalance, supabase } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'
import {
  getServiceEmoji,
  getServiceDisplayTitle,
  UserService,
  getServiceDisplayName,
} from '@/utils/serviceMapping'
import { generateUserExcelReport } from '@/utils/excelReportGenerator'
import { getMainMenuText } from '@/navigation'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import {
  getUserBalanceStatsOptimized,
  OptimizedBalanceStats,
} from '@/core/supabase/getUserBalanceStatsOptimized'
import { getSpendingBreakdown } from '@/core/supabase/getSpendingBreakdown'

/**
 * Функция для получения детализации трат пользователя
 * @deprecated Используется только как fallback, если оптимизированная функция недоступна
 */
async function getUserSpendingDetailsFallback(userId: string) {
  // Получаем все транзакции пользователя
  const { data: payments, error } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('telegram_id', userId)
    .eq('status', 'COMPLETED')
    .order('payment_date', { ascending: false })

  if (error || !payments) {
    return null
  }

  // Анализируем транзакции
  const incomes = payments.filter(p => p.type === 'MONEY_INCOME')
  const outcomes = payments.filter(p => p.type === 'MONEY_OUTCOME')

  // Разделяем доходы на реальные и бонусы
  const realIncomes = incomes.filter(p => p.category === 'REAL')
  const bonusIncomes = incomes.filter(p => p.category === 'BONUS')

  // Разделяем реальные доходы по способам оплаты
  const rublesIncomes = realIncomes.filter(
    p =>
      p.currency === 'RUB' &&
      (p.payment_method === 'Robokassa' || p.payment_method === 'Manual') &&
      p.status === 'COMPLETED'
  )
  const starsIncomes = realIncomes.filter(
    p =>
      (p.currency === 'XTR' || p.currency === 'STARS') &&
      p.payment_method === 'Telegram' &&
      p.status === 'COMPLETED'
  )

  // Подсчитываем суммы
  const totalRealIncomeStars = realIncomes.reduce(
    (sum, p) => sum + (p.stars || 0),
    0
  )
  const totalBonusStars = bonusIncomes.reduce(
    (sum, p) => sum + (p.stars || 0),
    0
  )
  const totalOutcomeStars = outcomes.reduce((sum, p) => sum + (p.stars || 0), 0)

  // Подсчитываем суммы по способам оплаты
  const rublesStars = rublesIncomes.reduce((sum, p) => sum + (p.stars || 0), 0)
  const rublesAmount = rublesIncomes.reduce(
    (sum, p) => sum + (p.amount || 0),
    0
  )
  const telegramStars = starsIncomes.reduce((sum, p) => sum + (p.stars || 0), 0)

  // Анализ по сервисам - ВСЕ сервисы
  const serviceStats = new Map<string, { count: number; stars: number }>()
  outcomes.forEach(payment => {
    // Используем новую функцию маппинга для определения правильного сервиса
    const mappedService = getServiceDisplayName(
      payment.service_type,
      payment.description
    )
    const serviceKey = mappedService

    const current = serviceStats.get(serviceKey) || { count: 0, stars: 0 }
    current.count += 1
    current.stars += payment.stars || 0
    serviceStats.set(serviceKey, current)
  })

  // ВСЕ сервисы, отсортированные по тратам
  const allServices = Array.from(serviceStats.entries()).sort(
    ([, a], [, b]) => b.stars - a.stars
  )

  // Последние 5 операций расходов (более детально)
  const recentOutcomes = outcomes.slice(0, 5)

  // Последние 3 пополнения (только реальные)
  const recentTopUps = realIncomes.slice(0, 3)

  return {
    totalRealIncomeStars,
    totalBonusStars,
    totalOutcomeStars,
    currentBalance: totalRealIncomeStars + totalBonusStars - totalOutcomeStars,
    allServices,
    recentOutcomes,
    recentTopUps,
    totalTransactions: payments.length,
    hasBonuses: totalBonusStars > 0,
    // Новые поля для разделения по способам оплаты
    rublesStars,
    rublesAmount,
    telegramStars,
    hasRublesPayments: rublesIncomes.length > 0,
    hasTelegramPayments: starsIncomes.length > 0,
    rublesIncomes,
    starsIncomes,
  }
}

/**
 * Преобразует оптимизированные данные в формат для отображения
 */
function convertOptimizedStatsToDisplayFormat(stats: OptimizedBalanceStats) {
  return {
    totalRealIncomeStars: stats.total_real_income,
    totalBonusStars: stats.total_bonus_income,
    totalOutcomeStars: stats.total_outcome,
    currentBalance: stats.current_balance,
    allServices: stats.services_breakdown.map(
      s =>
        [s.service, { count: s.count, stars: s.total_stars }] as [
          string,
          { count: number; stars: number },
        ]
    ),
    recentOutcomes: stats.recent_expenses.map(e => ({
      payment_date: e.date,
      stars: e.stars,
      service_type: e.service,
      description: e.description,
    })),
    recentTopUps: stats.recent_topups.map(t => ({
      payment_date: t.date,
      stars: t.stars,
      amount: t.amount,
      currency: t.currency,
      payment_method: t.payment_method,
    })),
    totalTransactions: stats.total_transactions,
    hasBonuses: stats.total_bonus_income > 0,
    rublesStars: stats.payment_methods.rubles.stars,
    rublesAmount: stats.payment_methods.rubles.amount,
    telegramStars: stats.payment_methods.telegram_stars.stars,
    hasRublesPayments: stats.payment_methods.rubles.count > 0,
    hasTelegramPayments: stats.payment_methods.telegram_stars.count > 0,
  }
}

export const balanceScene = new Scenes.WizardScene<MyContext>(
  'balance_scene',
  async (ctx: MyContext) => {
    try {
      console.log('CASE: balanceScene')
      const isRu = isRussianFromState(ctx)
      const userId = ctx.from?.id.toString() || ''

      // Получаем баланс и детализацию через оптимизированную функцию
      const balance = await getUserBalance(userId)

      // Пробуем получить данные через оптимизированную функцию
      const optimizedStats = await getUserBalanceStatsOptimized(userId)
      const spendingDetails = optimizedStats
        ? convertOptimizedStatsToDisplayFormat(optimizedStats)
        : await getUserSpendingDetailsFallback(userId)

      if (!spendingDetails) {
        // Если нет данных о тратах, показываем простой баланс
        await ctx.reply(
          isRu
            ? `💰✨ <b>Ваш баланс:</b> ${balance} ⭐️`
            : `💰✨ <b>Your balance:</b> ${balance} ⭐️`,
          { parse_mode: 'HTML' }
        )
      } else {
        // The RPC groups spend by the service_type column, which a database
        // trigger collapses ('other' for AI Photoshop, face swap, avatar
        // transform). The rows carry the real service in their description;
        // regroup from them, and keep the RPC grouping only if they are
        // unreadable. See getSpendingBreakdown.
        const breakdown = await getSpendingBreakdown(userId)
        if (breakdown) spendingDetails.allServices = breakdown

        // Формируем детальное сообщение
        let message = isRu
          ? `💰 <b>Ваш баланс и статистика</b>\n\n`
          : `💰 <b>Your balance and statistics</b>\n\n`

        // Текущий баланс (округляем до 2 знаков)
        const formattedBalance = Math.floor(balance * 100) / 100
        message += isRu
          ? `💎 <b>Текущий баланс:</b> ${formattedBalance} ⭐\n\n`
          : `💎 <b>Current balance:</b> ${formattedBalance} ⭐\n\n`

        // Общая статистика
        const totalSpent =
          Math.floor(spendingDetails.totalOutcomeStars * 100) / 100
        const totalTopUps =
          Math.floor(spendingDetails.totalRealIncomeStars * 100) / 100

        message += isRu
          ? `📊 <b>Общая статистика:</b>\n`
          : `📊 <b>Overall statistics:</b>\n`

        // Показываем разделение по способам пополнения
        if (
          spendingDetails.hasRublesPayments ||
          spendingDetails.hasTelegramPayments
        ) {
          message += isRu
            ? `   📈 <b>Пополнения:</b>\n`
            : `   📈 <b>Top-ups:</b>\n`

          // Показываем рубли только если есть платежи в рублях
          if (spendingDetails.hasRublesPayments) {
            const rublesStars =
              Math.floor(spendingDetails.rublesStars * 100) / 100
            const rublesAmount =
              Math.floor(spendingDetails.rublesAmount * 100) / 100
            message += isRu
              ? `      💳 Через Robokassa: ${rublesStars} ⭐ (${rublesAmount} руб.)\n`
              : `      💳 Via Robokassa: ${rublesStars} ⭐ (${rublesAmount} RUB)\n`
          }

          // Показываем Telegram Stars только если есть такие платежи
          if (spendingDetails.hasTelegramPayments) {
            const telegramStars =
              Math.floor(spendingDetails.telegramStars * 100) / 100
            message += isRu
              ? `      ⭐ Через Telegram Stars: ${telegramStars} ⭐\n`
              : `      ⭐ Via Telegram Stars: ${telegramStars} ⭐\n`
          }

          message += isRu
            ? `   📈 <b>Итого пополнений:</b> ${totalTopUps} ⭐\n`
            : `   📈 <b>Total top-ups:</b> ${totalTopUps} ⭐\n`
        } else {
          message += isRu
            ? `   📈 Всего пополнений: ${totalTopUps} ⭐\n`
            : `   📈 Total top-ups: ${totalTopUps} ⭐\n`
        }

        // Показываем бонусы только если они есть
        if (spendingDetails.hasBonuses) {
          const totalBonuses =
            Math.floor(spendingDetails.totalBonusStars * 100) / 100
          message += isRu
            ? `   🎁 Бонусы получено: ${totalBonuses} ⭐\n`
            : `   🎁 Bonuses received: ${totalBonuses} ⭐\n`
        }

        message += isRu
          ? `   📉 Всего потрачено: ${totalSpent} ⭐\n`
          : `   📉 Total spent: ${totalSpent} ⭐\n`

        message += isRu
          ? `   🔢 Всего операций: ${spendingDetails.totalTransactions}\n\n`
          : `   🔢 Total transactions: ${spendingDetails.totalTransactions}\n\n`

        // ВСЕ сервисы по тратам
        if (spendingDetails.allServices.length > 0) {
          message += isRu
            ? `🛠️ <b>Детализация по сервисам:</b>\n`
            : `🛠️ <b>Services breakdown:</b>\n`

          spendingDetails.allServices.forEach(([service, stats], index) => {
            const percentage =
              spendingDetails.totalOutcomeStars > 0
                ? Math.floor(
                    (stats.stars / spendingDetails.totalOutcomeStars) * 1000
                  ) / 10
                : 0

            const serviceStars = Math.floor(stats.stars * 100) / 100

            // Эмодзи и название для сервисов
            const serviceEmoji = getServiceEmoji(service)
            const serviceTitle = getServiceDisplayTitle(
              service as UserService,
              undefined,
              isRu
            )

            message += `   ${index + 1}. ${serviceEmoji} ${serviceTitle}:\n`
            message += `      💰 ${serviceStars}⭐ (${percentage}%)\n`
            message += `      🔢 ${stats.count} ${
              isRu ? 'операций' : 'operations'
            }\n\n`
          })
        }

        // Последние пополнения с разделением по способам
        if (spendingDetails.recentTopUps.length > 0) {
          message += isRu
            ? `📈 <b>Последние пополнения:</b>\n`
            : `📈 <b>Recent top-ups:</b>\n`

          spendingDetails.recentTopUps.forEach((payment, index) => {
            const date = new Date(payment.payment_date).toLocaleDateString(
              isRu ? 'ru-RU' : 'en-US'
            )
            const stars = Math.floor((payment.stars || 0) * 100) / 100
            const amount = Math.floor((payment.amount || 0) * 100) / 100

            // Определяем способ оплаты и иконку
            let paymentIcon = '📈'
            let paymentMethod = ''

            if (
              payment.currency === 'RUB' &&
              (payment.payment_method === 'Robokassa' ||
                payment.payment_method === 'Manual')
            ) {
              paymentIcon = '💳'
              paymentMethod = isRu ? ' (Robokassa)' : ' (Robokassa)'
            } else if (
              (payment.currency === 'XTR' || payment.currency === 'STARS') &&
              payment.payment_method === 'Telegram'
            ) {
              paymentIcon = '⭐'
              paymentMethod = isRu ? ' (Telegram Stars)' : ' (Telegram Stars)'
            }

            message += `   ${index + 1}. ${paymentIcon} ${date}: ${stars}⭐`
            if (payment.currency === 'RUB' && amount > 0) {
              message += ` (${amount} ${isRu ? 'руб.' : 'RUB'})`
            }
            message += paymentMethod
            message += `\n`
          })
          message += '\n'
        }

        // Последние траты
        if (spendingDetails.recentOutcomes.length > 0) {
          message += isRu
            ? `📉 <b>Последние траты:</b>\n`
            : `📉 <b>Recent expenses:</b>\n`

          spendingDetails.recentOutcomes.forEach((payment, index) => {
            const date = new Date(payment.payment_date).toLocaleDateString(
              isRu ? 'ru-RU' : 'en-US'
            )
            const stars = Math.floor((payment.stars || 0) * 100) / 100
            const serviceEmoji = getServiceEmoji(
              payment.service_type || 'unknown',
              payment.description || undefined
            )
            const serviceTitle = getServiceDisplayTitle(
              (payment.service_type || 'unknown') as UserService,
              payment.description || undefined,
              isRu
            )

            message += `   ${
              index + 1
            }. 📉 ${date}: ${stars}⭐ - ${serviceEmoji} ${serviceTitle}\n`
          })
        }

        await ctx.reply(message, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: isRu
                    ? '📊 Скачать детальный отчет Excel'
                    : '📊 Download detailed Excel report',
                  callback_data: 'download_excel_report',
                },
              ],
              [
                {
                  text: isRu ? '🔙 Назад в меню' : '🔙 Back to menu',
                  callback_data: 'back_to_menu',
                },
              ],
            ],
          },
        })

        // Добавляем reply кнопки для навигации
        await ctx.reply(
          isRu
            ? '👆 Выберите действие выше или используйте кнопки ниже:'
            : '👆 Choose an action above or use the buttons below:',
          {
            reply_markup: {
              keyboard: [[isRu ? 'Отмена' : 'Cancel', getMainMenuText(isRu)]],
              resize_keyboard: true,
              one_time_keyboard: false,
            },
          }
        )
      }

      // Переходим к следующему шагу для обработки reply кнопок
      return ctx.wizard.next()
    } catch (error) {
      console.error('Error in balanceScene:', error)
      const isRu = isRussianFromState(ctx)
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при получении информации о балансе'
          : '❌ Error occurred while getting balance information'
      )
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)
    }
  },
  // Шаг 2: Обработка reply кнопок
  async (ctx: MyContext) => {
    const isRu = isRussianFromState(ctx)

    if (!ctx.message || !('text' in ctx.message)) {
      return
    }

    const text = ctx.message.text

    // Отмена
    if (text === (isRu ? 'Отмена' : 'Cancel')) {
      await ctx.reply(
        isRu
          ? '❌ Процесс отменён. Возвращаюсь в главное меню.'
          : '❌ Process cancelled. Returning to main menu.',
        { reply_markup: { remove_keyboard: true } }
      )
      await ctx.scene.leave()
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)
      return
    }

    // Главное меню
    if (text === getMainMenuText(isRu)) {
      await ctx.reply(
        isRu ? '👋 Возвращаемся в главное меню' : '👋 Returning to main menu',
        { reply_markup: { remove_keyboard: true } }
      )
      await ctx.scene.leave()
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)
      return
    }

    // ✅ КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проверяем кнопки меню
    try {
      const { ALL_BUTTONS } = await import('@/navigation/config/buttons.config')
      const button = Object.values(ALL_BUTTONS).find(
        btn => btn.ru === text || btn.en === text
      )

      if (button) {
        // Это кнопка меню! Выходим из сцены и позволяем глобальному обработчику её обработать
        console.log('🔄 [balanceScene] Menu button detected, exiting scene', {
          telegramId: ctx.from?.id,
          buttonText: text,
        })
        await ctx.reply(
          isRu ? '👋 Возвращаемся в главное меню' : '👋 Returning to main menu',
          { reply_markup: { remove_keyboard: true } }
        )
        return ctx.scene.leave()
      }
    } catch (error) {
      // Если не удалось импортировать, продолжаем с обычной обработкой
      console.warn('⚠️ [balanceScene] Failed to import NAVIGATION_BUTTONS', {
        error: error instanceof Error ? error.message : String(error),
        telegramId: ctx.from?.id,
      })
    }

    // Игнорируем другие сообщения
    await ctx.reply(
      isRu
        ? '👆 Пожалуйста, используйте кнопки выше'
        : '👆 Please use the buttons above',
      { reply_markup: { remove_keyboard: true } }
    )
    await ctx.scene.leave()
    await ctx.scene.leave()
    const { showMainMenu } = await import('@/navigation')
    await showMainMenu(ctx)
    return
  }
)

// Обработчик для кнопки скачивания Excel отчета
balanceScene.action('download_excel_report', async (ctx: MyContext) => {
  try {
    const isRu = isRussianFromState(ctx)
    const userId = ctx.from?.id.toString() || ''

    await ctx.answerCbQuery(
      isRu ? '📊 Генерируем отчет...' : '📊 Generating report...'
    )

    // Показываем индикатор загрузки
    await ctx.editMessageText(
      isRu
        ? '📊 Генерируем детальный Excel-отчет...\n⏳ Это может занять несколько секунд'
        : '📊 Generating detailed Excel report...\n⏳ This may take a few seconds',
      { parse_mode: 'HTML' }
    )

    // Генерируем Excel отчет
    const excelBuffer = await generateUserExcelReport(userId)

    // Получаем username для имени файла
    const { data: userInfo } = await supabase
      .from('users')
      .select('username')
      .eq('telegram_id', userId)
      .single()

    const filename = `financial_report_${userInfo?.username || userId}_${
      new Date().toISOString().split('T')[0]
    }.xlsx`

    // Отправляем файл
    await ctx.replyWithDocument(
      {
        source: excelBuffer,
        filename: filename,
      },
      {
        caption: isRu
          ? `📊 <b>Ваш персональный финансовый отчет</b>\n\n` +
            `📅 Дата: ${new Date().toLocaleDateString('ru-RU')}\n` +
            `📋 Включает: все транзакции, аналитику по сервисам, детальную историю\n\n` +
            `💡 <i>Откройте файл в Excel или Google Sheets для лучшего просмотра</i>`
          : `📊 <b>Your personal financial report</b>\n\n` +
            `📅 Date: ${new Date().toLocaleDateString('en-US')}\n` +
            `📋 Includes: all transactions, service analytics, detailed history\n\n` +
            `💡 <i>Open the file in Excel or Google Sheets for best viewing</i>`,
        parse_mode: 'HTML',
      }
    )

    // Возвращаем исходное сообщение с кнопками
    await ctx.editMessageText(
      isRu
        ? '✅ Отчет успешно сгенерирован и отправлен!'
        : '✅ Report successfully generated and sent!',
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: isRu ? '🔙 Назад в меню' : '🔙 Back to menu',
                callback_data: 'back_to_menu',
              },
            ],
          ],
        },
      }
    )
  } catch (error) {
    console.error('Error generating Excel report:', error)
    const isRu = isRussianFromState(ctx)

    await ctx.editMessageText(
      isRu
        ? '❌ Произошла ошибка при генерации отчета. Попробуйте позже.'
        : '❌ Error occurred while generating report. Please try again later.',
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: isRu ? '🔙 Назад в меню' : '🔙 Back to menu',
                callback_data: 'back_to_menu',
              },
            ],
          ],
        },
      }
    )
  }
})

// Обработчик для кнопки "Назад в меню"
balanceScene.action('back_to_menu', async (ctx: MyContext) => {
  await ctx.answerCbQuery()
  await ctx.scene.leave()
  const { showMainMenu } = await import('@/navigation')
  await showMainMenu(ctx)
})

// Функция getServiceEmoji теперь импортируется из @/utils/serviceMapping
