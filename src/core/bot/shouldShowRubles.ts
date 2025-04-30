// В файле src/helpers/paymentHelper.ts (или другом подходящем)
import { MyContext } from '@/interfaces' // Убедись, что путь к MyContext верный
// Убедись, что путь к BotId верный
import { logger } from '@/utils/logger' // Убедись, что путь к logger верный
import { BOT_NAMES } from '@/core/bot'
/**
 * Определяет, следует ли отображать опции оплаты в рублях для текущего бота.
 * @param ctx Контекст Telegraf
 * @returns true, если рубли нужно показывать, иначе false.
 */
export function shouldShowRubles(ctx: MyContext): boolean {
  const botInfo = ctx.botInfo
  if (!botInfo) {
    logger.warn(
      '[shouldShowRubles] ctx.botInfo is undefined. Defaulting to show rubles.',
      {
        telegram_id: ctx.from?.id,
        scene: ctx.scene?.current?.id,
      }
    )
    // По умолчанию разрешаем, чтобы не сломать других ботов, если botInfo нет
    return true
  }

  // Определяем ID бота. Используем id, если есть, иначе username.
  const botIdentifier = botInfo.username || botInfo.id?.toString()

  if (botIdentifier === 'NeurostylistShtogrina_bot') {
    // Для стилиста рубли не показываем
    return false
  }

  // Для всех остальных ботов рубли показываем
  return true
}
