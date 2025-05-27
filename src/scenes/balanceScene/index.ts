import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { getUserBalance, supabase } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'
import {
  getServiceEmoji,
  getServiceDisplayTitle,
  UserService,
} from '@/utils/serviceMapping'
import { generateUserExcelReport } from '@/utils/excelReportGenerator'

/**
 * Функция для получения детализации трат пользователя
 */
async function getUserSpendingDetails(userId: string) {
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
    const service = payment.service_type || 'unknown'
    const current = serviceStats.get(service) || { count: 0, stars: 0 }
    current.count += 1
    current.stars += payment.stars || 0
    serviceStats.set(service, current)
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

export const balanceScene = new Scenes.WizardScene<MyContext>(
  'balanceScene',
  async (ctx: MyContext) => {
    try {
      console.log('CASE: balanceScene')
      const isRu = ctx.from?.language_code === 'ru'
      const userId = ctx.from?.id.toString() || ''

      // Получаем баланс и детализацию
      const balance = await getUserBalance(userId)
      const spendingDetails = await getUserSpendingDetails(userId)

      if (!spendingDetails) {
        // Если нет данных о тратах, показываем простой баланс
        await ctx.reply(
          isRu
            ? `💰✨ <b>Ваш баланс:</b> ${balance} ⭐️`
            : `💰✨ <b>Your balance:</b> ${balance} ⭐️`,
          { parse_mode: 'HTML' }
        )
      } else {
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
            const serviceTitle = getServiceDisplayTitle(service as UserService)

            message += `   ${index + 1}. ${serviceEmoji} ${serviceTitle}:\n`
            message += `      💰 ${serviceStars}⭐ (${percentage}%)\n`
            message += `      🔢 ${stats.count} ${isRu ? 'операций' : 'operations'}\n\n`
          })
        }

        // Последние пополнения с разделением по способам
        if (spendingDetails.recentTopUps.length > 0) {
          message += isRu
            ? `📈 <b>Последние пополнения:</b>\n`
            : `📈 <b>Recent top-ups:</b>\n`

          spendingDetails.recentTopUps.forEach((payment, index) => {
            const date = new Date(payment.payment_date).toLocaleDateString(
              'ru-RU'
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
              message += ` (${amount} руб.)`
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
              'ru-RU'
            )
            const stars = Math.floor((payment.stars || 0) * 100) / 100
            const serviceEmoji = getServiceEmoji(
              payment.service_type || 'unknown'
            )
            const serviceTitle = getServiceDisplayTitle(
              (payment.service_type || 'unknown') as UserService
            )

            message += `   ${index + 1}. 📉 ${date}: ${stars}⭐ - ${serviceEmoji} ${serviceTitle}\n`
          })
        }

        await ctx.reply(message, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '📊 Скачать детальный отчет Excel',
                  callback_data: 'download_excel_report',
                },
              ],
              [
                {
                  text: '🔙 Назад в меню',
                  callback_data: 'back_to_menu',
                },
              ],
            ],
          },
        })
      }

      // Не переходим в меню автоматически, ждем действий пользователя
    } catch (error) {
      console.error('Error in balanceScene:', error)
      const isRu = ctx.from?.language_code === 'ru'
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при получении информации о балансе'
          : '❌ Error occurred while getting balance information'
      )
      await ctx.scene.enter(ModeEnum.MainMenu)
    }
  }
)

// Обработчик для кнопки скачивания Excel отчета
balanceScene.action('download_excel_report', async (ctx: MyContext) => {
  try {
    const isRu = ctx.from?.language_code === 'ru'
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

    const filename = `financial_report_${userInfo?.username || userId}_${new Date().toISOString().split('T')[0]}.xlsx`

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
    const isRu = ctx.from?.language_code === 'ru'

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
  await ctx.scene.enter(ModeEnum.MainMenu)
})

// Функция getServiceEmoji теперь импортируется из @/utils/serviceMapping
