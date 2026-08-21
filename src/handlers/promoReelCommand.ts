import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { renderOnServer } from '@/services/renderServer/client'

/**
 * /promoreel [url-говорящего-аватара] — собрать промо-рилс УДАЛЁННО.
 *
 * Первый путь в боте, который реально доводит задачу до рендер-сервера и
 * возвращает готовый файл (прежние пути упирались в списанный nexrender или
 * событие без подписчика). Админ-команда намеренно: бесплатная, без списаний,
 * это проверка трубы, а не продукт.
 *
 * Композиция SplitTalkingHead уже развёрнута на сервере: говорящий аватар
 * (низ) + промо-ролик (верх) в сплите, начало и финал — во весь экран.
 */

const STORAGE_BASE =
  'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/relaunch'

/** Аватар по умолчанию — сгенерированный 21.08.2026 (LoRA gimba + OmniHuman). */
const DEFAULT_AVATAR_VIDEO = `${STORAGE_BASE}/avatar-talking.mp4`
const PROMO_BROLL = `${STORAGE_BASE}/relaunch-reel.mp4`

export async function handlePromoReelCommand(ctx: MyContext) {
  const text =
    ctx.message && 'text' in ctx.message ? ctx.message.text : ''
  const arg = text.split(/\s+/)[1]
  const lipSyncVideo = arg || DEFAULT_AVATAR_VIDEO

  await ctx.reply(
    `🎬 Рендерю промо-рилс на сервере…\nАватар: ${lipSyncVideo}\nОбычно 2–5 минут.`
  )

  try {
    const { outputUrl, renderId } = await renderOnServer({
      compositionId: 'SplitTalkingHead',
      inputProps: {
        lipSyncVideo,
        captions: [],
        showCaptions: false,
        backgroundMusic: '',
        splitRatio: 0.5,
        ctaText: 'ЖМИ /START',
        ctaHighlight: '/START',
        segments: [
          { type: 'fullscreen', startFrame: 0, durationFrames: 150, caption: '' },
          {
            type: 'split',
            startFrame: 150,
            durationFrames: 240,
            bRollUrl: PROMO_BROLL,
            bRollType: 'video',
            caption: '',
          },
          // Хвост с запасом: длительность композиции сервер берёт из самого
          // видео аватара, последний сегмент должен дотянуться до конца.
          { type: 'fullscreen', startFrame: 390, durationFrames: 1200, caption: '' },
        ],
      },
    })

    logger.info('🎬 [PromoReel] Готово', { renderId, outputUrl })
    await ctx.replyWithVideo(
      { url: outputUrl },
      { caption: `✅ Готово (render ${renderId})` }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.error('🎬 [PromoReel] Отказ', { error: msg })
    // Причина — человеку, без «попробуйте позже» вместо диагноза.
    await ctx.reply(`❌ Рендер не удался: ${msg}`)
  }
}
