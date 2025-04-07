import { MyContext } from '@/interfaces'
import { Scenes } from 'telegraf'
import { getUserBalanceStats, supabase } from '@/core/supabase'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { logger } from '@/utils/logger'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'
import { isDev } from '@/config'

export const balanceScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.BalanceScene,
  async (ctx: MyContext) => {
    const userId = isDev ? '2086031075' : ctx.from?.id || 0 // В коде был захардкожен ID, для дебага. Здесь используем ctx.from?.id
    const normalizedId = normalizeTelegramId(userId)
    const isRu = ctx.from?.language_code === 'ru'

    try {
      logger.info('🎯 Получение информации о балансе:', {
        description: 'Getting balance information',
        userId: normalizedId,
        bot: ctx.botInfo.username,
      })

      // Получаем всю статистику баланса одним запросом
      const stats = await getUserBalanceStats(
        normalizedId,
        ctx.botInfo.username
      )

      console.log('📊 Статистика баланса получена:', {
        balance: stats.balance,
        total_added: stats.total_added,
        total_spent: stats.total_spent,
        bonus_stars: stats.bonus_stars,
        added_stars: stats.added_stars,
        added_rub: stats.added_rub,
        services: stats.services,
        payment_methods: stats.payment_methods,
        payments_count: stats.payments?.length || 0,
        bot: ctx.botInfo.username,
      })

      // Дополнительный анализ платежей по методам оплаты и типам транзакций
      const rubIncome =
        stats.payments
          ?.filter(p => p.currency === 'RUB' && p.type === 'money_income')
          .reduce((sum, p) => sum + Number(p.stars || 0), 0) || 0

      const starsIncome =
        stats.payments
          ?.filter(p => p.currency === 'STARS' && p.type === 'money_income')
          .reduce((sum, p) => sum + Number(p.stars || 0), 0) || 0

      const systemIncome =
        stats.payments
          ?.filter(p => p.type === 'system')
          .reduce((sum, p) => sum + Number(p.stars || 0), 0) || 0

      console.log('🔎 Анализ транзакций:', {
        rubIncome,
        starsIncome,
        systemIncome,
        total: rubIncome + starsIncome + systemIncome,
        expected_total: stats.total_added,
        allPaymentsCount: stats.payments?.length || 0,
      })

      // Вывод первых 5 транзакций для отладки
      if (stats.payments && stats.payments.length > 0) {
        console.log(
          '💰 Примеры платежей:',
          stats.payments.slice(0, 5).map(p => ({
            type: p.type,
            amount: p.amount,
            stars: p.stars,
            currency: p.currency,
            description: p.description?.substring(0, 30),
          }))
        )
      }

      // Собираем сообщение для пользователя
      let message = isRu
        ? `💰 <b>Информация о балансе:</b>\n\n`
        : `💰 <b>Balance Information:</b>\n\n`

      message += isRu
        ? `✨ Текущий баланс: ${stats.balance.toFixed(2)} ⭐️\n` +
          (stats.bonus_stars > 0
            ? `🎁 Бонусные звезды: ${stats.bonus_stars.toFixed(2)} ⭐️\n`
            : '')
        : `✨ Current balance: ${stats.balance.toFixed(2)} ⭐️\n` +
          (stats.bonus_stars > 0
            ? `🎁 Bonus stars: ${stats.bonus_stars.toFixed(2)} ⭐️\n`
            : '')

      message += isRu
        ? `\n💳 <b>История платежей:</b>\n` +
          `➕ Всего пополнено: ${stats.total_added.toFixed(2)} ⭐️\n`
        : `\n💳 <b>Payment History:</b>\n` +
          `➕ Total added: ${stats.total_added.toFixed(2)} ⭐️\n`

      // Детализация пополнений
      if (rubIncome > 0) {
        message += isRu
          ? `• Пополнено через оплату: ${rubIncome.toFixed(2)} ⭐️\n`
          : `• Added through payment: ${rubIncome.toFixed(2)} ⭐️\n`
      }

      if (starsIncome > 0) {
        message += isRu
          ? `• Прямое пополнение звезд: ${starsIncome.toFixed(2)} ⭐️\n`
          : `• Direct stars top-up: ${starsIncome.toFixed(2)} ⭐️\n`
      }

      if (systemIncome > 0) {
        message += isRu
          ? `• Бонусные начисления: ${systemIncome.toFixed(2)} ⭐️\n`
          : `• Bonus credits: ${systemIncome.toFixed(2)} ⭐️\n`
      }

      // Информация о расходах
      message += isRu
        ? `➖ Всего потрачено: ${stats.total_spent.toFixed(2)} ⭐️\n`
        : `➖ Total spent: ${stats.total_spent.toFixed(2)} ⭐️\n`

      // Добавляем статистику по сервисам, если есть расходы
      if (stats.total_spent > 0 && Object.keys(stats.services).length > 0) {
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

      // Добавляем информацию о боте
      message += isRu
        ? `\n🤖 <b>Чат-бот:</b> ${ctx.botInfo.username}`
        : `\n🤖 <b>Chatbot:</b> ${ctx.botInfo.username}`

      logger.info('✅ Информация о балансе подготовлена:', {
        description: 'Balance information prepared',
        userId: normalizedId,
        balance: stats.balance,
        total_added: stats.total_added,
        total_spent: stats.total_spent,
        services_count: Object.keys(stats.services).length,
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
  switch (service) {
    case ModeEnum.NeuroPhoto:
    case 'neuro_photo':
      return '📸'
    case ModeEnum.NeuroPhotoV2:
      return '📸'
    case ModeEnum.TextToImage:
    case 'text_to_image':
      return '🎨'
    case ModeEnum.TextToSpeech:
    case 'text_to_speech':
      return '🔊'
    case ModeEnum.Voice:
    case 'voice':
      return '🗣'
    case ModeEnum.ImageToVideo:
    case 'image_to_video':
      return '🎬'
    case ModeEnum.TextToVideo:
    case 'text_to_video':
      return '📽'
    case ModeEnum.LipSync:
    case 'lip_sync':
      return '👄'
    case ModeEnum.ChatWithAvatar:
    case 'chat_with_avatar':
      return '💭'
    case ModeEnum.DigitalAvatarBody:
    case 'digital_avatar':
      return '🤖'
    case ModeEnum.DigitalAvatarBodyV2:
    case 'digital_avatar_v2':
      return '🤖'
    case ModeEnum.Avatar:
    case 'avatar':
      return '👤'
    case ModeEnum.ImageToPrompt:
    case 'image_to_prompt':
      return '🔍'
    case ModeEnum.SelectModel:
    case 'select_model':
      return '📋'
    case ModeEnum.SelectModelWizard:
      return '🧙‍♂️'
    case 'system':
      return '⚙️'
    default:
      return '⭐️'
  }
}

// Хелпер для получения названия сервиса
function getServiceName(service: string, isRu: boolean): string {
  switch (service) {
    case ModeEnum.NeuroPhoto:
    case 'neuro_photo':
      return isRu ? 'Нейрофото' : 'Neuro Photo'
    case ModeEnum.NeuroPhotoV2:
      return isRu ? 'Нейрофото V2' : 'Neuro Photo V2'
    case ModeEnum.TextToImage:
    case 'text_to_image':
      return isRu ? 'Текст в изображение' : 'Text to Image'
    case ModeEnum.TextToSpeech:
    case 'text_to_speech':
      return isRu ? 'Текст в речь' : 'Text to Speech'
    case ModeEnum.Voice:
    case 'voice':
      return isRu ? 'Голос' : 'Voice'
    case ModeEnum.ImageToVideo:
    case 'image_to_video':
      return isRu ? 'Изображение в видео' : 'Image to Video'
    case ModeEnum.TextToVideo:
    case 'text_to_video':
      return isRu ? 'Текст в видео' : 'Text to Video'
    case ModeEnum.LipSync:
    case 'lip_sync':
      return isRu ? 'Синхронизация губ' : 'Lip Sync'
    case ModeEnum.ChatWithAvatar:
    case 'chat_with_avatar':
      return isRu ? 'Чат с аватаром' : 'Chat with Avatar'
    case ModeEnum.DigitalAvatarBody:
    case 'digital_avatar':
      return isRu ? 'Цифровой аватар' : 'Digital Avatar'
    case ModeEnum.DigitalAvatarBodyV2:
    case 'digital_avatar_v2':
      return isRu ? 'Цифровой аватар V2' : 'Digital Avatar V2'
    case ModeEnum.Avatar:
    case 'avatar':
      return isRu ? 'Аватар' : 'Avatar'
    case ModeEnum.ImageToPrompt:
    case 'image_to_prompt':
      return isRu ? 'Анализ изображения' : 'Image Analysis'
    case ModeEnum.SelectModel:
    case 'select_model':
      return isRu ? 'Выбор модели' : 'Model Selection'
    case ModeEnum.SelectModelWizard:
      return isRu ? 'Мастер выбора модели' : 'Model Selection Wizard'
    case 'system':
      return isRu ? 'Системные операции' : 'System Operations'
    default:
      return service
  }
}
