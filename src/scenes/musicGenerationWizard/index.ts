/**
 * 🎵 Music Generation Wizard
 * Генерация музыки через Suno AI (v4.5+) с использованием KIE AI API
 *
 * Flow:
 * 1. Выбор типа (инструментал/с вокалом)
 * 2. Выбор длительности (1/2/3 мин)
 * 3. Ввод описания музыки
 * 4. Генерация и отправка результата
 */

import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'
import { isRussian } from '@/helpers/language'
import {
  handleHelpCancel,
  createHelpCancelKeyboard,
  sendGenericErrorMessage,
  getMainMenuText,
} from '@/navigation'
import { logger } from '@/utils/logger'
import { getUserBalance, updateUserBalance } from '@/core/supabase'
import { PaymentType } from '@/interfaces/payments.interface'
import { KieAiProvider } from '@/services/video-providers/KieAiProvider'
import {
  calculateSunoMusicCost,
  SUNO_MUSIC_CONFIG,
  SUNO_DURATION_OPTIONS,
} from '@/price/helpers/modelsCost'
import axios from 'axios'
import { standardButtons } from '@/navigation/helpers/actionButtons'

// Интерфейс данных wizard
interface MusicWizardData {
  instrumental: boolean
  duration: number
  prompt?: string
  lyrics?: string
  cost: number
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎵 WIZARD SCENE
// ═══════════════════════════════════════════════════════════════════════════

export const musicGenerationWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.MusicGeneration,

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Выбор типа музыки (инструментал или с вокалом)
  // ═══════════════════════════════════════════════════════════════════════════
  async ctx => {
    const isRu = isRussian(ctx)

    // Инициализируем данные wizard
    ctx.session.wizardData = {
      instrumental: true,
      duration: 60,
      cost: calculateSunoMusicCost(60),
    } as MusicWizardData

    // Устанавливаем режим
    ctx.session.mode = ModeEnum.MusicGeneration

    const text = isRu
      ? '🎵 <b>Генерация музыки через Suno AI</b>\n\n' +
        'Создайте уникальную музыку с помощью нейросети!\n\n' +
        '<b>Выберите тип:</b>'
      : '🎵 <b>Music Generation with Suno AI</b>\n\n' +
        'Create unique music with AI!\n\n' +
        '<b>Choose type:</b>'

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          isRu ? '🎹 Инструментал' : '🎹 Instrumental',
          'music_instrumental'
        ),
        Markup.button.callback(
          isRu ? '🎤 С вокалом' : '🎤 With Vocals',
          'music_vocal'
        ),
      ],
      [
        Markup.button.callback(
          isRu ? '❌ Отмена' : '❌ Cancel',
          'music_cancel'
        ),
      ],
    ])

    await ctx.reply(text, { parse_mode: 'HTML', ...keyboard })
    return ctx.wizard.next()
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Выбор длительности
  // ═══════════════════════════════════════════════════════════════════════════
  async ctx => {
    // Этот шаг обрабатывается через action handlers
    // Ждем callback от кнопок
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Ввод описания музыки
  // ═══════════════════════════════════════════════════════════════════════════
  async ctx => {
    const isRu = isRussian(ctx)
    const wizardData = ctx.session.wizardData as MusicWizardData

    // Проверяем команды отмены/помощи
    if (await handleHelpCancel(ctx)) {
      return ctx.scene.leave()
    }

    // Проверяем, что это текстовое сообщение
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, отправьте текстовое описание музыки'
          : '❌ Please send a text description of the music'
      )
      return
    }

    const prompt = ctx.message.text.trim()

    // Валидация промпта
    if (prompt.length < 10) {
      await ctx.reply(
        isRu
          ? '❌ Описание слишком короткое. Минимум 10 символов.\n\nПопробуйте описать жанр, настроение, инструменты.'
          : '❌ Description is too short. Minimum 10 characters.\n\nTry describing genre, mood, instruments.'
      )
      return
    }

    if (prompt.length > 500) {
      await ctx.reply(
        isRu
          ? '❌ Описание слишком длинное. Максимум 500 символов.'
          : '❌ Description is too long. Maximum 500 characters.'
      )
      return
    }

    // Сохраняем промпт
    wizardData.prompt = prompt

    // Проверяем баланс
    if (!ctx.from?.id) {
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    const currentBalance = await getUserBalance(ctx.from.id.toString())
    const cost = wizardData.cost

    if (currentBalance < cost) {
      // A refusal that names the price hands over the way to pay it. The
      // person asked for something paid and was told the only obstacle is
      // money -- the highest-intent moment there is, and it carried nothing
      // to press.
      await ctx.reply(
        isRu
          ? `❌ Недостаточно средств для генерации музыки.\n\n` +
              `💰 Нужно: ${cost} ⭐\n` +
              `💳 Ваш баланс: ${currentBalance.toFixed(2)} ⭐\n\n` +
              `Пополните баланс и попробуйте снова.`
          : `❌ Insufficient funds for music generation.\n\n` +
              `💰 Required: ${cost} ⭐\n` +
              `💳 Your balance: ${currentBalance.toFixed(2)} ⭐\n\n` +
              `Top up your balance and try again.`,
        standardButtons(isRu)
      )
      return ctx.scene.leave()
    }

    // Списываем баланс
    // In-flight guard: the charge + music generation below are awaited before
    // scene.leave(), so a second text during the ~generation would re-enter and
    // double-charge. Reject-before-set (sync); released in the .leave() handler
    // below (covers every scene.leave path without re-indenting the step). #1357
    if (ctx.session.musicGenerationInProgress) {
      await ctx.reply(
        isRu
          ? '⏳ Уже генерирую, подождите...'
          : '⏳ Already generating, please wait...'
      )
      return
    }
    ctx.session.musicGenerationInProgress = true
    const paymentSuccess = await updateUserBalance(
      ctx.from.id.toString(),
      cost,
      PaymentType.MONEY_OUTCOME,
      'Генерация музыки Suno AI',
      {
        service_type: 'MUSIC_GENERATION',
        model: SUNO_MUSIC_CONFIG.model,
        duration: wizardData.duration,
        instrumental: wizardData.instrumental,
      }
    )

    if (!paymentSuccess) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка при списании средств. Попробуйте позже.'
          : '❌ Payment processing error. Please try again later.'
      )
      return ctx.scene.leave()
    }

    const newBalance = await getUserBalance(ctx.from.id.toString())

    // Показываем статус обработки
    const statusMsg = await ctx.reply(
      isRu
        ? `⏳ Генерирую музыку... Это может занять 2-3 минуты.\n\n` +
            `🎵 Тип: ${wizardData.instrumental ? 'Инструментал' : 'С вокалом'}\n` +
            `⏱ Длительность: ${wizardData.duration / 60} мин\n` +
            `💰 Списано: ${cost} ⭐`
        : `⏳ Generating music... This may take 2-3 minutes.\n\n` +
            `🎵 Type: ${wizardData.instrumental ? 'Instrumental' : 'With Vocals'}\n` +
            `⏱ Duration: ${wizardData.duration / 60} min\n` +
            `💰 Charged: ${cost} ⭐`,
      Markup.removeKeyboard()
    )

    logger.info('[MusicGeneration] Starting generation', {
      telegramId: ctx.from.id,
      prompt: prompt.substring(0, 50) + '...',
      duration: wizardData.duration,
      instrumental: wizardData.instrumental,
      cost,
    })

    try {
      // Генерируем музыку через KieAiProvider
      const provider = new KieAiProvider()

      const response = await provider.generateMusic({
        model: SUNO_MUSIC_CONFIG.model,
        prompt: wizardData.prompt,
        duration: wizardData.duration,
        instrumental: wizardData.instrumental,
        lyrics: wizardData.lyrics,
      })

      if (!response.success || !response.data?.audioUrl) {
        throw new Error(response.error || 'Failed to generate music')
      }

      logger.info('[MusicGeneration] Generation successful', {
        telegramId: ctx.from.id,
        audioUrl: response.data.audioUrl.substring(0, 50) + '...',
        duration: response.data.duration,
      })

      // Скачиваем аудио
      const audioResponse = await axios.get(response.data.audioUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
      })

      const audioBuffer = Buffer.from(audioResponse.data)

      // Удаляем статусное сообщение
      try {
        await ctx.deleteMessage(statusMsg.message_id)
      } catch (e) {
        // Ignore
      }

      // Отправляем аудио
      const caption = isRu
        ? `🎵 <b>Ваша музыка готова!</b>\n\n` +
          `📝 ${wizardData.prompt?.substring(0, 100)}${(wizardData.prompt?.length || 0) > 100 ? '...' : ''}\n\n` +
          `🎹 Тип: ${wizardData.instrumental ? 'Инструментал' : 'С вокалом'}\n` +
          `⏱ Длительность: ${wizardData.duration / 60} мин\n` +
          `🤖 Модель: ${SUNO_MUSIC_CONFIG.model}\n\n` +
          `💰 Стоимость: ${cost} ⭐\n` +
          `💳 Ваш баланс: ${newBalance.toFixed(2)} ⭐`
        : `🎵 <b>Your music is ready!</b>\n\n` +
          `📝 ${wizardData.prompt?.substring(0, 100)}${(wizardData.prompt?.length || 0) > 100 ? '...' : ''}\n\n` +
          `🎹 Type: ${wizardData.instrumental ? 'Instrumental' : 'With Vocals'}\n` +
          `⏱ Duration: ${wizardData.duration / 60} min\n` +
          `🤖 Model: ${SUNO_MUSIC_CONFIG.model}\n\n` +
          `💰 Cost: ${cost} ⭐\n` +
          `💳 Your balance: ${newBalance.toFixed(2)} ⭐`

      await ctx.replyWithAudio(
        { source: audioBuffer, filename: 'suno_music.mp3' },
        {
          caption,
          parse_mode: 'HTML',
          title: 'Suno AI Music',
          performer: 'Generated by Suno AI',
        }
      )

      // Показываем кнопки для продолжения
      const keyboard = Markup.keyboard([
        [Markup.button.text(isRu ? '🎵 Ещё трек' : '🎵 Another track')],
        [Markup.button.text(getMainMenuText(isRu))],
      ]).resize()

      await ctx.reply(
        isRu
          ? '✅ Готово! Хотите сгенерировать ещё один трек?'
          : '✅ Done! Would you like to generate another track?',
        keyboard
      )

      logger.info('[MusicGeneration] Completed successfully', {
        telegramId: ctx.from.id,
        duration: wizardData.duration,
        cost,
      })
    } catch (error) {
      logger.error('[MusicGeneration] Error during generation', {
        telegramId: ctx.from.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      // Удаляем статусное сообщение
      try {
        await ctx.deleteMessage(statusMsg.message_id)
      } catch (e) {
        // Ignore
      }

      // Возвращаем деньги при ошибке
      try {
        const refundSuccess = await updateUserBalance(
          ctx.from.id.toString(),
          cost,
          PaymentType.MONEY_INCOME,
          'Возврат за неудачную генерацию музыки',
          {
            service_type: 'MUSIC_GENERATION_REFUND',
            reason: error instanceof Error ? error.message : 'Unknown error',
          }
        )

        if (refundSuccess) {
          logger.info('[MusicGeneration] Refund processed successfully', {
            telegramId: ctx.from.id,
            refundAmount: cost,
          })

          await ctx.reply(
            isRu
              ? `❌ Ошибка при генерации музыки.\n\n💫 Средства возвращены: ${cost} ⭐\n\nПопробуйте с другим описанием.`
              : `❌ Error generating music.\n\n💫 Refunded: ${cost} ⭐\n\nTry with a different description.`
          )
        } else {
          // updateUserBalance returns false WITHOUT throwing on a ghost-payer
          // or a database error, so this branch is reached without an
          // exception. Saying nothing here is the worst of the three
          // outcomes: the generation failed, the stars were not returned, and
          // the user is told neither. The same shape is already handled in
          // aiCoverWizard and async-lipsync-manager; this matches them.
          logger.error('[MusicGeneration] Refund returned false', {
            telegramId: ctx.from.id,
            refundAmount: cost,
          })
          await ctx.reply(
            isRu
              ? `❌ Ошибка при генерации музыки.\n\n💫 Вернуть ${cost} ⭐ автоматически не удалось — напишите в поддержку.`
              : `❌ Error generating music.\n\n💫 Could not return ${cost} ⭐ automatically — please contact support.`
          )
        }
      } catch (refundError) {
        logger.error('[MusicGeneration] CRITICAL: Refund failed!', {
          telegramId: ctx.from.id,
          refundAmount: cost,
          error:
            refundError instanceof Error
              ? refundError.message
              : String(refundError),
        })

        await ctx.reply(
          isRu
            ? '❌ Ошибка при генерации музыки. Обратитесь в поддержку для возврата средств.'
            : '❌ Error generating music. Contact support for a refund.'
        )
      }
    }

    return ctx.scene.leave()
  }
)

// Release the in-flight guard on ANY scene exit (all step-3 paths call
// scene.leave). Reject-before-set is in step 3; this is the release. #1357
musicGenerationWizard.leave(async ctx => {
  if (ctx.session) {
    ctx.session.musicGenerationInProgress = false
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 ACTION HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

// Выбор типа: инструментал
musicGenerationWizard.action('music_instrumental', async ctx => {
  await ctx.answerCbQuery()

  const isRu = isRussian(ctx)
  const wizardData = ctx.session.wizardData as MusicWizardData
  wizardData.instrumental = true

  await showDurationSelection(ctx, isRu)
  return ctx.wizard.next()
})

// Выбор типа: с вокалом
musicGenerationWizard.action('music_vocal', async ctx => {
  await ctx.answerCbQuery()

  const isRu = isRussian(ctx)
  const wizardData = ctx.session.wizardData as MusicWizardData
  wizardData.instrumental = false

  await showDurationSelection(ctx, isRu)
  return ctx.wizard.next()
})

// Выбор длительности
musicGenerationWizard.action(/^duration_(\d+)$/, async ctx => {
  const isRu = isRussian(ctx)
  const duration = parseInt(ctx.match[1])

  // The duration comes from callback data, which is untrusted. Bind it to the
  // server-side allowlist BEFORE pricing: a forged `duration_0` gives
  // calculateSunoMusicCost(0) = 0, and the generation step's `balance < cost`
  // gate then degenerates to `balance < 0` (always false), handing out a full
  // paid Suno track for 0 stars at the owner's expense. Reject anything not in
  // SUNO_DURATION_OPTIONS and re-show the buttons; never advance with cost 0.
  const isAllowed = SUNO_DURATION_OPTIONS.some(opt => opt.seconds === duration)
  if (!isAllowed) {
    await ctx.answerCbQuery(
      isRu
        ? 'Выберите длительность кнопкой ниже.'
        : 'Please choose a duration below.'
    )
    return
  }

  await ctx.answerCbQuery()

  const wizardData = ctx.session.wizardData as MusicWizardData

  wizardData.duration = duration
  wizardData.cost = calculateSunoMusicCost(duration)

  await showPromptInput(ctx, isRu, wizardData)
  return ctx.wizard.next()
})

// Назад к выбору типа
musicGenerationWizard.action('music_back_type', async ctx => {
  await ctx.answerCbQuery()

  const isRu = isRussian(ctx)

  const text = isRu
    ? '🎵 <b>Генерация музыки через Suno AI</b>\n\n' +
      'Создайте уникальную музыку с помощью нейросети!\n\n' +
      '<b>Выберите тип:</b>'
    : '🎵 <b>Music Generation with Suno AI</b>\n\n' +
      'Create unique music with AI!\n\n' +
      '<b>Choose type:</b>'

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(
        isRu ? '🎹 Инструментал' : '🎹 Instrumental',
        'music_instrumental'
      ),
      Markup.button.callback(
        isRu ? '🎤 С вокалом' : '🎤 With Vocals',
        'music_vocal'
      ),
    ],
    [Markup.button.callback(isRu ? '❌ Отмена' : '❌ Cancel', 'music_cancel')],
  ])

  await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard })
  ctx.wizard.selectStep(0)
})

// Отмена
musicGenerationWizard.action('music_cancel', async ctx => {
  await ctx.answerCbQuery()

  const isRu = isRussian(ctx)
  await ctx.editMessageText(
    isRu ? '❌ Генерация музыки отменена.' : '❌ Music generation cancelled.'
  )
  return ctx.scene.leave()
})

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 HEARS HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

// Кнопка "Ещё трек"
musicGenerationWizard.hears(['🎵 Ещё трек', '🎵 Another track'], async ctx => {
  return ctx.scene.reenter()
})

// Help и Cancel команды
musicGenerationWizard.help(ctx => handleHelpCancel(ctx))
musicGenerationWizard.command('cancel', ctx => handleHelpCancel(ctx))

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Показать выбор длительности
 */
async function showDurationSelection(
  ctx: MyContext,
  isRu: boolean
): Promise<void> {
  const wizardData = ctx.session.wizardData as MusicWizardData

  const text = isRu
    ? `🎵 <b>Генерация музыки</b>\n\n` +
      `Тип: ${wizardData.instrumental ? '🎹 Инструментал' : '🎤 С вокалом'}\n\n` +
      `<b>Выберите длительность:</b>`
    : `🎵 <b>Music Generation</b>\n\n` +
      `Type: ${wizardData.instrumental ? '🎹 Instrumental' : '🎤 With Vocals'}\n\n` +
      `<b>Choose duration:</b>`

  const durationButtons = SUNO_DURATION_OPTIONS.map(opt =>
    Markup.button.callback(
      `${isRu ? opt.label : opt.labelEn} - ${opt.stars}⭐`,
      `duration_${opt.seconds}`
    )
  )

  const keyboard = Markup.inlineKeyboard([
    durationButtons,
    [
      Markup.button.callback(isRu ? '⬅️ Назад' : '⬅️ Back', 'music_back_type'),
      Markup.button.callback(isRu ? '❌ Отмена' : '❌ Cancel', 'music_cancel'),
    ],
  ])

  await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard })
}

/**
 * Показать ввод описания
 */
async function showPromptInput(
  ctx: MyContext,
  isRu: boolean,
  wizardData: MusicWizardData
): Promise<void> {
  const text = isRu
    ? `🎵 <b>Генерация музыки</b>\n\n` +
      `Тип: ${wizardData.instrumental ? '🎹 Инструментал' : '🎤 С вокалом'}\n` +
      `Длительность: ${wizardData.duration / 60} мин\n` +
      `Стоимость: ${wizardData.cost} ⭐\n\n` +
      `<b>Опишите желаемую музыку:</b>\n\n` +
      `💡 <i>Примеры:</i>\n` +
      `• "Энергичная электронная музыка для тренировки"\n` +
      `• "Спокойная акустическая гитара для релакса"\n` +
      `• "Эпический оркестр для трейлера"\n` +
      (wizardData.instrumental
        ? ''
        : `\n📝 Или отправьте текст песни для вокала`)
    : `🎵 <b>Music Generation</b>\n\n` +
      `Type: ${wizardData.instrumental ? '🎹 Instrumental' : '🎤 With Vocals'}\n` +
      `Duration: ${wizardData.duration / 60} min\n` +
      `Cost: ${wizardData.cost} ⭐\n\n` +
      `<b>Describe the desired music:</b>\n\n` +
      `💡 <i>Examples:</i>\n` +
      `• "Energetic electronic music for workout"\n` +
      `• "Calm acoustic guitar for relaxation"\n` +
      `• "Epic orchestral music for trailer"\n` +
      (wizardData.instrumental ? '' : `\n📝 Or send song lyrics for vocals`)

  await ctx.editMessageText(text, { parse_mode: 'HTML' })
}

export default musicGenerationWizard
