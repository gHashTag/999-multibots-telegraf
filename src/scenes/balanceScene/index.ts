import { MyContext } from '@/interfaces'
import { Scenes } from 'telegraf'
import { getUserBalance, supabase } from '@/core/supabase'

export const balanceScene = new Scenes.WizardScene<MyContext>(
  'balanceScene',
  async (ctx: MyContext) => {
    try {
      console.log('🎯 CASE: balanceScene - Getting user balance info', {
        description: 'Getting detailed balance information',
        userId: ctx.from?.id,
      })

      const isRu = ctx.from?.language_code === 'ru'
      const userId = ctx.from?.id || 0

      // Get current balance
      const balance = await getUserBalance(userId)

      // Get payment statistics using direct query
      const { data: payments } = await supabase
        .from('payments')
        .select('amount, type, payment_method, status')
        .eq('telegram_id', userId)

      // Initialize statistics
      const stats = {
        total_added: 0,
        total_spent: 0,
        services: {} as Record<string, number>,
      }

      // Calculate statistics from payments
      if (payments) {
        payments.forEach(payment => {
          // Only count COMPLETED payments
          if (payment.status === 'COMPLETED') {
            if (payment.type === 'income') {
              stats.total_added += Number(payment.amount)
            } else if (payment.type === 'outcome') {
              stats.total_spent += Number(payment.amount)

              // Group by payment method for services usage
              const service = payment.payment_method
              if (service) {
                stats.services[service] =
                  (stats.services[service] || 0) + Number(payment.amount)
              }
            }
          }
        })
      }

      // Calculate bonus stars
      const bonusStars = Math.max(
        0,
        balance - (stats.total_added - stats.total_spent)
      )

      let message = isRu
        ? `💰 <b>Информация о балансе:</b>\n\n`
        : `💰 <b>Balance Information:</b>\n\n`

      message += isRu
        ? `✨ Текущий баланс: ${balance} ⭐️\n` +
          (bonusStars > 0 ? `🎁 Бонусные звезды: ${bonusStars} ⭐️\n` : '')
        : `✨ Current balance: ${balance} ⭐️\n` +
          (bonusStars > 0 ? `🎁 Bonus stars: ${bonusStars} ⭐️\n` : '')

      message += isRu
        ? `\n💳 <b>История платежей:</b>\n` +
          `➕ Всего пополнено: ${stats.total_added} ⭐️\n` +
          `➖ Всего потрачено: ${stats.total_spent} ⭐️\n`
        : `\n💳 <b>Payment History:</b>\n` +
          `➕ Total added: ${stats.total_added} ⭐️\n` +
          `➖ Total spent: ${stats.total_spent} ⭐️\n`

      // Add service usage statistics if there are any expenses
      if (stats.total_spent > 0) {
        message += isRu
          ? `\n🤖 <b>Использование сервисов:</b>\n`
          : `\n🤖 <b>Services Usage:</b>\n`

        // Add only services that were used
        Object.entries(stats.services).forEach(([service, amount]) => {
          if (amount > 0) {
            const serviceEmoji = getServiceEmoji(service)
            const serviceName = getServiceName(service, isRu)
            message += isRu
              ? `${serviceEmoji} ${serviceName}: ${amount} ⭐️\n`
              : `${serviceEmoji} ${serviceName}: ${amount} ⭐️\n`
          }
        })
      }

      await ctx.reply(message, { parse_mode: 'HTML' })
      await ctx.scene.enter('menuScene')
    } catch (error) {
      console.error('❌ Error sending balance:', error)
      throw error
    }
  }
)

// Helper function to get emoji for service
function getServiceEmoji(service: string): string {
  const emojis: Record<string, string> = {
    NeuroPhoto: '📸',
    TextToImage: '🎨',
    TextToSpeech: '🔊',
    Voice: '🗣',
    ImageToVideo: '🎬',
    TextToVideo: '📽',
    LipSync: '👄',
    VideoInUrl: '🎥',
    ChatWithAvatar: '💭',
    AvatarBrain: '🧠',
  }
  return emojis[service] || '⭐️'
}

// Helper function to get service name
function getServiceName(service: string, isRu: boolean): string {
  const names: Record<string, [string, string]> = {
    NeuroPhoto: ['Нейрофото', 'Neuro Photo'],
    TextToImage: ['Текст в изображение', 'Text to Image'],
    TextToSpeech: ['Текст в речь', 'Text to Speech'],
    Voice: ['Голос', 'Voice'],
    ImageToVideo: ['Изображение в видео', 'Image to Video'],
    TextToVideo: ['Текст в видео', 'Text to Video'],
    LipSync: ['Синхронизация губ', 'Lip Sync'],
    VideoInUrl: ['Видео по ссылке', 'Video from URL'],
    ChatWithAvatar: ['Чат с аватаром', 'Avatar Chat'],
    AvatarBrain: ['Мозг аватара', 'Avatar Brain'],
  }
  return names[service]
    ? isRu
      ? names[service][0]
      : names[service][1]
    : service
}
