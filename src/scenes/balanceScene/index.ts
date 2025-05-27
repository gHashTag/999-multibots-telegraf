import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { getUserBalance, supabase } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'
import { getServiceEmoji } from '@/utils/serviceMapping'

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

        message += isRu
          ? `   📈 Всего пополнений: ${totalTopUps} ⭐\n`
          : `   📈 Total top-ups: ${totalTopUps} ⭐\n`

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

            // Эмодзи для сервисов
            const serviceEmoji = getServiceEmoji(service)

            message += `   ${index + 1}. ${serviceEmoji} ${service}:\n`
            message += `      💰 ${serviceStars}⭐ (${percentage}%)\n`
            message += `      🔢 ${stats.count} ${isRu ? 'операций' : 'operations'}\n\n`
          })
        }

        // Последние пополнения
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

            message += `   ${index + 1}. 📈 ${date}: ${stars}⭐`
            if (payment.currency === 'RUB' && amount > 0) {
              message += ` (${amount} руб.)`
            }
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

            message += `   ${index + 1}. 📉 ${date}: ${stars}⭐ - ${serviceEmoji} ${payment.service_type || 'unknown'}\n`
          })
        }

        await ctx.reply(message, { parse_mode: 'HTML' })
      }

      await ctx.scene.enter(ModeEnum.MainMenu)
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

// Функция getServiceEmoji теперь импортируется из @/utils/serviceMapping
