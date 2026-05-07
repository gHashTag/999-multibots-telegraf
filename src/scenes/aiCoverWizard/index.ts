/**
 * 🎧 AI COVER WIZARD
 *
 * Сцена создания AI Cover - песня голосом пользователя
 *
 * Flow:
 * 1. Проверить наличие обученной голосовой модели
 * 2. Получить песню от пользователя
 * 3. Валидация (макс 10 мин, форматы)
 * 4. Подтверждение и списание
 * 5. Генерация AI Cover
 * 6. Отправка результата
 */

import { Scenes, Markup } from 'telegraf'
import { message } from 'telegraf/filters'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { showMainMenu } from '@/navigation'
import { logger } from '@/utils/logger'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import {
  getVoiceModel,
  hasReadyVoiceModel,
} from '@/core/supabase/voiceModels'
import {
  generateAICover,
  validateSongDuration,
  validateAudioFormat,
} from '@/services/rvc'
import { getAICoverCost, AI_COVER_CONFIG } from '@/price/helpers/modelsCost'

// ═══════════════════════════════════════════════════════════════════════════
// WIZARD SETUP
// ═══════════════════════════════════════════════════════════════════════════

interface WizardState {
  step: number
  songFileId?: string
  songUrl?: string
  voiceModelUrl?: string
}

export const aiCoverWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.AICover,

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Проверка голосовой модели
  // ═══════════════════════════════════════════════════════════════════════════
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    if (!telegramId) {
      await ctx.reply(isRu ? '❌ Ошибка авторизации' : '❌ Authorization error')
      return ctx.scene.leave()
    }

    logger.info('[AI_COVER] Wizard started', { telegramId })

    // Инициализация состояния
    ctx.session.wizardData = {
      step: 1,
    } as WizardState

    // Проверка наличия голосовой модели
    const hasModel = await hasReadyVoiceModel(telegramId)

    if (!hasModel) {
      await ctx.reply(
        isRu
          ? `🎤 Сначала нужно обучить голосовую модель!\n\n` +
              `Для создания AI Cover требуется ваша обученная модель голоса.\n\n` +
              `Перейдите в "🎤 Обучить голос" и загрузите аудио с вашим голосом.`
          : `🎤 First you need to train a voice model!\n\n` +
              `Creating AI Cover requires your trained voice model.\n\n` +
              `Go to "🎤 Train Voice" and upload audio with your voice.`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? '🎤 Обучить голос' : '🎤 Train Voice',
              'go_to_voice_training'
            ),
          ],
          [
            Markup.button.callback(
              isRu ? '🏠 В меню' : '🏠 To menu',
              'back_to_menu'
            ),
          ],
        ])
      )
      return
    }

    // Получаем модель для сохранения URL
    const voiceModel = await getVoiceModel(telegramId)
    if (voiceModel?.model_url) {
      const state = ctx.session.wizardData as WizardState
      state.voiceModelUrl = voiceModel.model_url
    }

    // Показать инструкции
    await showInstructions(ctx, isRu)
    return ctx.wizard.next()
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Получение песни
  // ═══════════════════════════════════════════════════════════════════════════
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    if (!telegramId) {
      return ctx.scene.leave()
    }

    // Проверка: это аудио?
    if (!ctx.message || !('audio' in ctx.message)) {
      await ctx.reply(
        isRu
          ? '📎 Пожалуйста, отправьте песню в формате MP3, WAV или OGG'
          : '📎 Please send a song in MP3, WAV or OGG format'
      )
      return
    }

    const audio = ctx.message.audio
    const fileId = audio.file_id
    const duration = audio.duration || 0
    const mimeType = audio.mime_type || 'audio/mpeg'
    const title = audio.title || 'Unknown'
    const performer = audio.performer || 'Unknown'

    logger.info('[AI_COVER] Song received', {
      telegramId,
      fileId,
      duration,
      mimeType,
      title,
      performer,
    })

    // Валидация формата
    if (!validateAudioFormat(mimeType)) {
      await ctx.reply(
        isRu
          ? `❌ Неподдерживаемый формат: ${mimeType}\n\n` +
              `Поддерживаемые форматы: MP3, WAV, OGG`
          : `❌ Unsupported format: ${mimeType}\n\n` +
              `Supported formats: MP3, WAV, OGG`
      )
      return
    }

    // Валидация длительности
    const validation = validateSongDuration(duration)
    if (!validation.valid) {
      await ctx.reply(
        isRu
          ? `❌ ${validation.error}\n\nМаксимум: ${AI_COVER_CONFIG.maxSongDuration / 60} минут.`
          : `❌ ${validation.error}\n\nMaximum: ${AI_COVER_CONFIG.maxSongDuration / 60} minutes.`
      )
      return
    }

    // Сохраняем в состояние
    const state = ctx.session.wizardData as WizardState
    state.songFileId = fileId
    state.step = 2

    // Показать подтверждение
    const cost = getAICoverCost()
    const durationMin = Math.floor(duration / 60)
    const durationSec = duration % 60

    await ctx.reply(
      isRu
        ? `🎵 Песня принята!\n\n` +
            `📀 ${title} - ${performer}\n` +
            `📏 Длительность: ${durationMin}:${durationSec.toString().padStart(2, '0')}\n` +
            `💰 Стоимость: ${cost}⭐\n\n` +
            `Генерация займёт 1-3 минуты.`
        : `🎵 Song accepted!\n\n` +
            `📀 ${title} - ${performer}\n` +
            `📏 Duration: ${durationMin}:${durationSec.toString().padStart(2, '0')}\n` +
            `💰 Cost: ${cost}⭐\n\n` +
            `Generation will take 1-3 minutes.`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            isRu ? `✅ Создать AI Cover (${cost}⭐)` : `✅ Create AI Cover (${cost}⭐)`,
            'confirm_cover'
          ),
        ],
        [
          Markup.button.callback(
            isRu ? '❌ Отмена' : '❌ Cancel',
            'back_to_menu'
          ),
        ],
      ])
    )
    return ctx.wizard.next()
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Подтверждение (обрабатывается через action)
  // ═══════════════════════════════════════════════════════════════════════════
  async ctx => {
    return
  }
)

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function showInstructions(ctx: MyContext, isRu: boolean) {
  const cost = getAICoverCost()
  const maxDuration = AI_COVER_CONFIG.maxSongDuration / 60

  const text = isRu
    ? `🎧 *AI Cover - Песня вашим голосом*\n\n` +
        `Отправьте песню, и она будет исполнена вашим голосом!\n\n` +
        `📋 *Требования к песне:*\n` +
        `• Форматы: MP3, WAV, OGG\n` +
        `• Максимум: ${maxDuration} минут\n` +
        `• Желательно: чёткий вокал\n\n` +
        `💡 *Рекомендации:*\n` +
        `• Выбирайте песни с чистым вокалом\n` +
        `• Избегайте сильной обработки голоса\n` +
        `• Лучше работает с соло-исполнением\n\n` +
        `💰 *Стоимость:* ${cost}⭐ за песню\n` +
        `⏱️ *Время генерации:* 1-3 минуты`
    : `🎧 *AI Cover - Song with your voice*\n\n` +
        `Send a song and it will be performed with your voice!\n\n` +
        `📋 *Song requirements:*\n` +
        `• Formats: MP3, WAV, OGG\n` +
        `• Maximum: ${maxDuration} minutes\n` +
        `• Preferably: clear vocals\n\n` +
        `💡 *Recommendations:*\n` +
        `• Choose songs with clean vocals\n` +
        `• Avoid heavy vocal processing\n` +
        `• Works better with solo performances\n\n` +
        `💰 *Cost:* ${cost}⭐ per song\n` +
        `⏱️ *Generation time:* 1-3 minutes`

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback(
          isRu ? '🏠 В меню' : '🏠 To menu',
          'back_to_menu'
        ),
      ],
    ]),
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

aiCoverWizard.action('go_to_voice_training', async ctx => {
  await ctx.answerCbQuery()
  await ctx.scene.leave()
  return ctx.scene.enter(ModeEnum.VoiceTraining)
})

aiCoverWizard.action('back_to_menu', async ctx => {
  await ctx.answerCbQuery()
  await ctx.scene.leave()
  return showMainMenu(ctx)
})

aiCoverWizard.action('confirm_cover', async ctx => {
  await ctx.answerCbQuery()
  const isRu = isRussianFromState(ctx)
  const telegramId = ctx.from?.id?.toString()

  if (!telegramId) {
    await ctx.reply(isRu ? '❌ Ошибка авторизации' : '❌ Authorization error')
    return ctx.scene.leave()
  }

  const state = ctx.session.wizardData as WizardState
  if (!state?.songFileId || !state?.voiceModelUrl) {
    await ctx.reply(
      isRu ? '❌ Данные не найдены. Попробуйте снова.' : '❌ Data not found. Try again.'
    )
    return ctx.scene.leave()
  }

  const cost = getAICoverCost()

  try {
    // 1. Проверка баланса
    const balance = await getUserBalance(telegramId)
    if (balance < cost) {
      await ctx.reply(
        isRu
          ? `❌ Недостаточно средств.\n\nТребуется: ${cost}⭐\nВаш баланс: ${balance}⭐`
          : `❌ Insufficient funds.\n\nRequired: ${cost}⭐\nYour balance: ${balance}⭐`
      )
      return ctx.scene.leave()
    }

    // 2. Списание баланса
    await updateUserBalance(
      telegramId,
      cost,
      PaymentType.MONEY_OUTCOME,
      'AI Cover generation'
    )

    logger.info('[AI_COVER] Balance deducted', {
      telegramId,
      cost,
      newBalance: balance - cost,
    })

    // 3. Сообщение о начале генерации
    const processingMsg = await ctx.reply(
      isRu
        ? `⏳ Создаём AI Cover...\n\nЭто займёт 1-3 минуты.`
        : `⏳ Creating AI Cover...\n\nThis will take 1-3 minutes.`
    )

    // 4. Получение URL песни
    const fileLink = await ctx.telegram.getFileLink(state.songFileId)
    const songUrl = fileLink.href

    // 5. Генерация AI Cover
    const result = await generateAICover({
      songUrl,
      voiceModelUrl: state.voiceModelUrl,
    })

    // 6. Удаление сообщения о загрузке
    try {
      await ctx.deleteMessage(processingMsg.message_id)
    } catch {
      // Ignore
    }

    // 7. Отправка результата
    await ctx.replyWithAudio(result.audioUrl, {
      caption: isRu
        ? `🎧 Ваш AI Cover готов!\n\n💰 Стоимость: ${cost}⭐`
        : `🎧 Your AI Cover is ready!\n\n💰 Cost: ${cost}⭐`,
    })

    await ctx.reply(
      isRu ? 'Хотите создать ещё один кавер?' : 'Want to create another cover?',
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            isRu ? '🔄 Ещё кавер' : '🔄 Another cover',
            'another_cover'
          ),
        ],
        [
          Markup.button.callback(
            isRu ? '🏠 В меню' : '🏠 To menu',
            'back_to_menu'
          ),
        ],
      ])
    )

    logger.info('[AI_COVER] Cover generated successfully', {
      telegramId,
      cost,
    })

    return ctx.scene.leave()
  } catch (error) {
    logger.error('[AI_COVER] Error generating cover', {
      telegramId,
      error: error instanceof Error ? error.message : String(error),
    })

    // Попытка возврата средств
    try {
      await updateUserBalance(
        telegramId,
        cost,
        PaymentType.REFUND,
        'AI Cover refund - error'
      )
      logger.info('[AI_COVER] Refund processed', {
        telegramId,
        amount: cost,
      })
    } catch (refundError) {
      logger.error('[AI_COVER] Refund failed', {
        telegramId,
        error: refundError instanceof Error ? refundError.message : String(refundError),
      })
    }

    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при генерации. Средства возвращены.'
        : '❌ Error during generation. Funds refunded.'
    )
    return ctx.scene.leave()
  }
})

aiCoverWizard.action('another_cover', async ctx => {
  await ctx.answerCbQuery()
  // Сброс состояния и возврат к шагу 1
  const telegramId = ctx.from?.id?.toString()
  if (!telegramId) {
    return ctx.scene.leave()
  }

  // Получаем модель заново
  const voiceModel = await getVoiceModel(telegramId)
  if (voiceModel?.model_url) {
    ctx.session.wizardData = {
      step: 1,
      voiceModelUrl: voiceModel.model_url,
    } as WizardState
  }

  const isRu = isRussianFromState(ctx)
  await showInstructions(ctx, isRu)
  return ctx.wizard.selectStep(1)
})

// ═══════════════════════════════════════════════════════════════════════════
// HEARS HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

aiCoverWizard.hears(
  ['🏠 Главное меню', '🏠 Main menu', '/menu'],
  async ctx => {
    await ctx.scene.leave()
    return showMainMenu(ctx)
  }
)

export default aiCoverWizard
