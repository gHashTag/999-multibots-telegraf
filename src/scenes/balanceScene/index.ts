import { MyContext } from '@/interfaces'
import { Scenes } from 'telegraf'
import { getUserBalance, supabase } from '@/core/supabase'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { logger } from '@/utils/logger'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'

export const balanceScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.BalanceScene,
  async (ctx: MyContext) => {
    const userId = ctx.from?.id || 0
    const normalizedId = normalizeTelegramId(userId)
    const isRu = ctx.from?.language_code === 'ru'

    try {
      logger.info('🎯 Получение информации о балансе:', {
        description: 'Getting balance information',
        userId: normalizedId,
        bot: ctx.botInfo.username,
      })

      // Получаем текущий баланс
      const balance = await getUserBalance(normalizedId, ctx.botInfo.username)

      // Получаем статистику платежей
      const { data: payments, error: paymentsError } = await supabase
        .from('payments_v2')
        .select('amount, type, payment_method, status, description')
        .eq('telegram_id', normalizedId)
        .eq('bot_name', ctx.botInfo.username)

      if (paymentsError) {
        logger.error('❌ Ошибка получения платежей:', {
          description: 'Error getting payments',
          error: paymentsError,
          userId: normalizedId,
        })
        throw paymentsError
      }

      // Инициализируем статистику
      const stats = {
        total_added: 0,
        total_spent: 0,
        services: {} as Record<string, number>,
      }

      // Считаем статистику из платежей
      if (payments) {
        payments.forEach(payment => {
          if (payment.status === 'COMPLETED') {
            const amount = Number(payment.amount)

            // Доход
            if (
              payment.type === 'money_income' ||
              payment.type === 'money_income' ||
              payment.description?.toLowerCase().includes('refund')
            ) {
              stats.total_added += amount
            }
            // Расход
            else if (
              payment.type === 'money_expense' ||
              payment.type === 'money_expense'
            ) {
              stats.total_spent += amount

              // Группируем по сервисам
              const service = payment.payment_method
              if (service) {
                stats.services[service] =
                  (stats.services[service] || 0) + amount
              }
            }
          }
        })
      }

      // Считаем бонусные звезды
      const bonusStars = Math.max(
        0,
        balance - (stats.total_added - stats.total_spent)
      )

      let message = isRu
        ? `💰 <b>Информация о балансе:</b>\n\n`
        : `💰 <b>Balance Information:</b>\n\n`

      message += isRu
        ? `✨ Текущий баланс: ${balance.toFixed(2)} ⭐️\n` +
          (bonusStars > 0
            ? `🎁 Бонусные звезды: ${bonusStars.toFixed(2)} ⭐️\n`
            : '')
        : `✨ Current balance: ${balance.toFixed(2)} ⭐️\n` +
          (bonusStars > 0
            ? `🎁 Bonus stars: ${bonusStars.toFixed(2)} ⭐️\n`
            : '')

      message += isRu
        ? `\n💳 <b>История платежей:</b>\n` +
          `➕ Всего пополнено: ${stats.total_added.toFixed(2)} ⭐️\n` +
          `➖ Всего потрачено: ${stats.total_spent.toFixed(2)} ⭐️\n`
        : `\n💳 <b>Payment History:</b>\n` +
          `➕ Total added: ${stats.total_added.toFixed(2)} ⭐️\n` +
          `➖ Total spent: ${stats.total_spent.toFixed(2)} ⭐️\n`

      // Добавляем статистику по сервисам если есть расходы
      if (stats.total_spent > 0) {
        message += isRu
          ? `\n🤖 <b>Использование сервисов:</b>\n`
          : `\n🤖 <b>Services Usage:</b>\n`

        Object.entries(stats.services)
          .sort(([, a], [, b]) => b - a) // Сортируем по убыванию сумм
          .forEach(([service, amount]) => {
            if (amount > 0) {
              const serviceEmoji = getServiceEmoji(service)
              const serviceName = getServiceName(service, isRu)
              message += `${serviceEmoji} ${serviceName}: ${amount.toFixed(
                2
              )} ⭐️\n`
            }
          })
      }

      logger.info('✅ Информация о балансе подготовлена:', {
        description: 'Balance information prepared',
        userId: normalizedId,
        balance,
        total_added: stats.total_added,
        total_spent: stats.total_spent,
      })

      await ctx.reply(message, { parse_mode: 'HTML' })
      await ctx.scene.enter('menuScene')
    } catch (error) {
      logger.error('❌ Ошибка в сцене баланса:', {
        description: 'Error in balance scene',
        error: error instanceof Error ? error.message : String(error),
        userId: ctx.from?.id,
      })

      const errorMessage = isRu
        ? '❌ Произошла ошибка при получении баланса. Пожалуйста, попробуйте позже.'
        : '❌ Error getting balance information. Please try again later.'

      await ctx.reply(errorMessage)
      await ctx.scene.enter('menuScene')
    }
  }
)

// Хелпер для получения эмодзи сервиса
function getServiceEmoji(service: string): string {
  const emojis: Record<string, string> = {
    [ModeEnum.NeuroPhoto]: '📸',
    [ModeEnum.NeuroPhotoV2]: '📸',
    [ModeEnum.TextToImage]: '🎨',
    [ModeEnum.TextToSpeech]: '🔊',
    [ModeEnum.Voice]: '🗣',
    [ModeEnum.ImageToVideo]: '🎬',
    [ModeEnum.TextToVideo]: '📽',
    [ModeEnum.LipSync]: '👄',
    [ModeEnum.ChatWithAvatar]: '💭',
    [ModeEnum.DigitalAvatarBody]: '🤖',
    [ModeEnum.DigitalAvatarBodyV2]: '🤖',
    [ModeEnum.Avatar]: '👤',
    [ModeEnum.ImageToPrompt]: '🔍',
    [ModeEnum.SelectModel]: '📋',
    [ModeEnum.SelectModelWizard]: '🧙‍♂️',
  }
  return emojis[service] || '⭐️'
}

// Хелпер для получения названия сервиса
function getServiceName(service: string, isRu: boolean): string {
  const names: Record<string, [string, string]> = {
    [ModeEnum.NeuroPhoto]: ['Нейрофото', 'Neuro Photo'],
    [ModeEnum.NeuroPhotoV2]: ['Нейрофото V2', 'Neuro Photo V2'],
    [ModeEnum.TextToImage]: ['Текст в изображение', 'Text to Image'],
    [ModeEnum.TextToSpeech]: ['Текст в речь', 'Text to Speech'],
    [ModeEnum.Voice]: ['Голос', 'Voice'],
    [ModeEnum.ImageToVideo]: ['Изображение в видео', 'Image to Video'],
    [ModeEnum.TextToVideo]: ['Текст в видео', 'Text to Video'],
    [ModeEnum.LipSync]: ['Синхронизация губ', 'Lip Sync'],
    [ModeEnum.ChatWithAvatar]: ['Чат с аватаром', 'Chat with Avatar'],
    [ModeEnum.DigitalAvatarBody]: ['Цифровой аватар', 'Digital Avatar'],
    [ModeEnum.DigitalAvatarBodyV2]: ['Цифровой аватар V2', 'Digital Avatar V2'],
    [ModeEnum.Avatar]: ['Аватар', 'Avatar'],
    [ModeEnum.ImageToPrompt]: ['Анализ изображения', 'Image Analysis'],
    [ModeEnum.SelectModel]: ['Выбор модели', 'Model Selection'],
    [ModeEnum.SelectModelWizard]: [
      'Мастер выбора модели',
      'Model Selection Wizard',
    ],
  }
  return names[service]
    ? isRu
      ? names[service][0]
      : names[service][1]
    : service
}
