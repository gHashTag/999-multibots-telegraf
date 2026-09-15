import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { runFactory, CANONS, CanonId } from '@/services/contentFactory'

/**
 * `/factory <канон> <текст>` — собрать рилс из текста и прислать сюда же.
 *
 *   /factory noir Почему троичная, а не двоичная? …
 *
 * Команда админская: один прогон стоит реальных денег у трёх провайдеров.
 * Прогресс идёт отдельными сообщениями, потому что конвейер занимает минуты,
 * а молчащий бот неотличим от зависшего.
 */
export async function handleFactoryCommand(ctx: MyContext): Promise<void> {
  if (!ctx.message || !('text' in ctx.message)) return

  const raw = ctx.message.text.replace(/^\/factory(@\S+)?\s*/i, '').trim()
  const [maybeCanon, ...rest] = raw.split(/\s+/)
  const canon = maybeCanon?.toLowerCase() as CanonId
  const script = rest.join(' ').trim()

  const known = Object.keys(CANONS).join(' | ')
  if (!raw || !CANONS[canon] || !script) {
    await ctx.reply(
      `Формат: /factory <${known}> <текст озвучки>\n\n` +
        `Пример:\n/factory noir Почему троичная, а не двоичная? Приводят одно число…\n\n` +
        `Каноны:\n` +
        `• noir — клуб «Золотая Литейная», ч/б смокинг, золото на имени\n` +
        `• promo — сплит с бироллом, жёлтые титры\n` +
        `• blog — гравюра блога, золото только заголовок`
    )
    return
  }

  const chatId = String(ctx.chat?.id ?? ctx.from?.id ?? '')
  // promise-checked: an estimate of a human wait, not a number any code enforces
  const started = await ctx.reply('🏭 Завод запущен. Это займёт 10–20 минут.')
  let lastText = ''

  try {
    const manifest = await runFactory(
      {
        canon,
        script,
        language: /[а-яё]/i.test(script) ? 'ru' : 'en',
        deliverTo: chatId,
      },
      {
        caption: `🏭 Рилс «${canon}» готов`,
        onProgress: msg => {
          // Правим одно сообщение вместо ленты из десяти.
          if (msg === lastText) return
          lastText = msg
          ctx.telegram
            .editMessageText(chatId, started.message_id, undefined, `🏭 ${msg}`)
            .catch(() => undefined)
        },
      }
    )

    if (!manifest.stages.deliver) {
      // Файл есть, но отправить не удалось — честнее дать ссылку, чем молчать.
      const url = manifest.stages.render?.video.url
      await ctx.reply(
        url
          ? `Рилс отрендерен, но отправить файлом не вышло. Ссылка: ${url}`
          : 'Рилс не дошёл до отправки. Подробности в логах.'
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('[factory] прогон упал', { message, canon })
    // Ни одна стадия не теряется: манифест на полке, повтор той же командой
    // поднимет готовое и доделает остаток.
    await ctx.reply(
      `❌ Завод остановился: ${message}\n\n` +
        `Сделанные стадии сохранены — повтори ту же команду, конвейер продолжит с места остановки.`
    )
  }
}
