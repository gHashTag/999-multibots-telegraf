/**
 * 🎤 VOICE TRAINING WIZARD
 *
 * Сцена обучения голосовой модели пользователя для AI Cover
 *
 * Flow:
 * 1. Показать инструкции и стоимость
 * 2. Получить аудио файл с голосом
 * 3. Валидация (30 сек - 3 мин, форматы)
 * 4. Подтверждение и списание
 * 5. Отправка в Inngest для обработки
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
  createVoiceModel,
  hasTrainingVoiceModel,
  hasReadyVoiceModel,
} from '@/core/supabase/voiceModels'
import { validateAudioFormat } from '@/services/rvc'
import {
  getVoiceTrainingCost,
  VOICE_TRAINING_CONFIG,
} from '@/price/helpers/modelsCost'
import { sendInngestEvent, INNGEST_EVENTS } from '@/inngest_app/client'
import { supabase } from '@/core/supabase/client'
import { refundAndTell } from '@/price/helpers/refundAndTell'
import { standardButtons } from '@/navigation/helpers/actionButtons'

// ═══════════════════════════════════════════════════════════════════════════
// WIZARD SETUP
// ═══════════════════════════════════════════════════════════════════════════

interface WizardState {
  step: number
  audioFileId?: string
  audioUrl?: string
  modelName?: string
}

/**
 * Получатель события мёртв: voiceTrainingRVC не зарегистрирована, таблицы
 * voice_models в базе нет. Пока это так — сцена отказывает на входе, не
 * взяв денег. Подробности у блока отказа в шаге 1.
 */
const VOICE_TRAINING_DISCONNECTED = true

export const voiceTrainingWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.VoiceTraining,

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Инструкции и проверка
  // ═══════════════════════════════════════════════════════════════════════════
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    if (!telegramId) {
      await ctx.reply(isRu ? '❌ Ошибка авторизации' : '❌ Authorization error')
      return ctx.scene.leave()
    }

    logger.info('[VOICE_TRAINING] Wizard started', { telegramId })

    // ЧЕСТНЫЙ ОТКАЗ: услуга не может быть оказана, поэтому не продаётся.
    //
    // Событие voice/training.start никто не слушает — voiceTrainingRVC не
    // зарегистрирована (src/__tests__/inngest/registration.test.ts), а
    // таблицы voice_models в базе нет (HTTP 404). Сцена же до сих пор
    // списывала 100⭐, падала на записи в БД и возвращала деньги — измерено:
    // единственная попытка за всю историю (2025-12-16) прошла ровно этот круг
    // (scripts/probe-training-charges.cjs).
    //
    // Тот же приём, что с парсингом Instagram (PR #510): отправитель
    // отказывает честно, пока получатель мёртв. Включать обратно — поставить
    // false ПОСЛЕ регистрации функции и создания таблицы.
    if (VOICE_TRAINING_DISCONNECTED) {
      await ctx.reply(
        isRu
          ? '🚧 Обучение голоса временно недоступно.\n\nМы работаем над этим. Загляните позже.'
          : '🚧 Voice training is temporarily unavailable.\n\nWe are working on it. Please check back later.'
      )
      return ctx.scene.leave()
    }

    // Инициализация состояния
    ctx.session.wizardData = {
      step: 1,
    } as WizardState

    // Проверка: уже есть готовая модель?
    const hasReady = await hasReadyVoiceModel(telegramId)
    if (hasReady) {
      await ctx.reply(
        isRu
          ? '✅ У вас уже есть обученная голосовая модель!\n\n' +
              'Перейдите в "🎧 AI Cover" чтобы создать кавер.\n\n' +
              'Хотите обучить новую модель? Это заменит текущую.'
          : '✅ You already have a trained voice model!\n\n' +
              'Go to "🎧 AI Cover" to create a cover.\n\n' +
              'Want to train a new model? This will replace the current one.',
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? '🔄 Обучить новую' : '🔄 Train new',
              'continue_training'
            ),
          ],
          [
            Markup.button.callback(
              isRu ? '🎧 К AI Cover' : '🎧 Go to AI Cover',
              'go_to_ai_cover'
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

    // Проверка: модель уже обучается?
    const hasTraining = await hasTrainingVoiceModel(telegramId)
    if (hasTraining) {
      await ctx.reply(
        isRu
          ? '⏳ У вас уже есть модель в процессе обучения.\n\n' +
              'Подождите завершения (5-10 минут) и попробуйте снова.'
          : '⏳ You already have a model being trained.\n\n' +
              'Wait for completion (5-10 minutes) and try again.',
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? '🏠 В меню' : '🏠 To menu',
              'back_to_menu'
            ),
          ],
        ])
      )
      return ctx.scene.leave()
    }

    // Показать инструкции
    await showInstructions(ctx, isRu)
    return ctx.wizard.next()
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Получение аудио
  // ═══════════════════════════════════════════════════════════════════════════
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    if (!telegramId) {
      return ctx.scene.leave()
    }

    // Проверка: это аудио?
    if (!ctx.message || !('audio' in ctx.message || 'voice' in ctx.message)) {
      await ctx.reply(
        isRu
          ? '📎 Пожалуйста, отправьте аудиофайл или голосовое сообщение'
          : '📎 Please send an audio file or voice message'
      )
      return
    }

    // Получаем информацию об аудио
    const audio = 'audio' in ctx.message ? ctx.message.audio : ctx.message.voice
    const fileId = audio.file_id
    const duration = audio.duration || 0
    const mimeType = 'mime_type' in audio ? audio.mime_type : 'audio/ogg'

    logger.info('[VOICE_TRAINING] Audio received', {
      telegramId,
      fileId,
      duration,
      mimeType,
    })

    // Валидация формата
    if (mimeType && !validateAudioFormat(mimeType)) {
      await ctx.reply(
        isRu
          ? `❌ Неподдерживаемый формат: ${mimeType}\n\n` +
              `Поддерживаемые форматы: MP3, WAV, OGG, M4A, FLAC`
          : `❌ Unsupported format: ${mimeType}\n\n` +
              `Supported formats: MP3, WAV, OGG, M4A, FLAC`
      )
      return
    }

    // Валидация длительности
    const { minAudioDuration, maxAudioDuration } = VOICE_TRAINING_CONFIG
    if (duration < minAudioDuration) {
      await ctx.reply(
        isRu
          ? `❌ Аудио слишком короткое (${duration} сек).\n` +
              `Минимум: ${minAudioDuration} секунд.`
          : `❌ Audio too short (${duration} sec).\n` +
              `Minimum: ${minAudioDuration} seconds.`
      )
      return
    }

    if (duration > maxAudioDuration) {
      await ctx.reply(
        isRu
          ? `❌ Аудио слишком длинное (${duration} сек).\n` +
              `Максимум: ${maxAudioDuration / 60} минуты.`
          : `❌ Audio too long (${duration} sec).\n` +
              `Maximum: ${maxAudioDuration / 60} minutes.`
      )
      return
    }

    // Сохраняем в состояние
    const state = ctx.session.wizardData as WizardState
    state.audioFileId = fileId
    state.step = 2

    // Показать подтверждение
    const cost = getVoiceTrainingCost()
    await ctx.reply(
      isRu
        ? `✅ Аудио принято!\n\n` +
            `📏 Длительность: ${duration} сек\n` +
            `💰 Стоимость обучения: ${cost}⭐\n\n` +
            `Обучение займёт 5-10 минут. Вы получите уведомление.`
        : `✅ Audio accepted!\n\n` +
            `📏 Duration: ${duration} sec\n` +
            `💰 Training cost: ${cost}⭐\n\n` +
            `Training will take 5-10 minutes. You will be notified.`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            isRu
              ? `✅ Начать обучение (${cost}⭐)`
              : `✅ Start training (${cost}⭐)`,
            'confirm_training'
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
    // Ожидание нажатия кнопки
    return
  }
)

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function showInstructions(ctx: MyContext, isRu: boolean) {
  const cost = getVoiceTrainingCost()
  const { minAudioDuration, maxAudioDuration } = VOICE_TRAINING_CONFIG

  const text = isRu
    ? `🎤 *Обучение голоса для AI Cover*\n\n` +
      `Загрузите аудио с вашим голосом для обучения модели.\n\n` +
      `📋 *Требования:*\n` +
      `• Длительность: ${minAudioDuration} сек - ${maxAudioDuration / 60} мин\n` +
      `• Форматы: MP3, WAV, OGG, M4A, FLAC\n` +
      `• Качество: чистый голос без музыки и шума\n\n` +
      `💡 *Рекомендации:*\n` +
      `• Говорите чётко и естественно\n` +
      `• Используйте тихое место\n` +
      `• Избегайте эха и фонового шума\n\n` +
      `💰 *Стоимость:* ${cost}⭐ (один раз)\n` +
      `⏱️ *Время обучения:* 5-10 минут`
    : `🎤 *Voice Training for AI Cover*\n\n` +
      `Upload audio with your voice to train the model.\n\n` +
      `📋 *Requirements:*\n` +
      `• Duration: ${minAudioDuration} sec - ${maxAudioDuration / 60} min\n` +
      `• Formats: MP3, WAV, OGG, M4A, FLAC\n` +
      `• Quality: clean voice without music and noise\n\n` +
      `💡 *Recommendations:*\n` +
      `• Speak clearly and naturally\n` +
      `• Use a quiet place\n` +
      `• Avoid echo and background noise\n\n` +
      `💰 *Cost:* ${cost}⭐ (one time)\n` +
      `⏱️ *Training time:* 5-10 minutes`

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

voiceTrainingWizard.action('continue_training', async ctx => {
  await ctx.answerCbQuery()
  const isRu = isRussianFromState(ctx)
  await showInstructions(ctx, isRu)
  return ctx.wizard.selectStep(1)
})

voiceTrainingWizard.action('go_to_ai_cover', async ctx => {
  await ctx.answerCbQuery()
  await ctx.scene.leave()
  return ctx.scene.enter(ModeEnum.AICover)
})

voiceTrainingWizard.action('back_to_menu', async ctx => {
  await ctx.answerCbQuery()
  await ctx.scene.leave()
  return showMainMenu(ctx)
})

voiceTrainingWizard.action('confirm_training', async ctx => {
  await ctx.answerCbQuery()
  const isRu = isRussianFromState(ctx)
  const telegramId = ctx.from?.id?.toString()

  // Дублирует отказ на входе: сегодня сюда не добраться (сессии in-memory),
  // но при переезде на персистентные сессии старая клавиатура снова смогла бы
  // списать за мёртвую услугу.
  if (VOICE_TRAINING_DISCONNECTED) {
    await ctx.reply(
      isRu
        ? '🚧 Обучение голоса временно недоступно.'
        : '🚧 Voice training is temporarily unavailable.'
    )
    return ctx.scene.leave()
  }

  if (!telegramId) {
    await ctx.reply(isRu ? '❌ Ошибка авторизации' : '❌ Authorization error')
    return ctx.scene.leave()
  }

  const state = ctx.session.wizardData as WizardState
  if (!state?.audioFileId) {
    await ctx.reply(
      isRu
        ? '❌ Аудио не найдено. Попробуйте снова.'
        : '❌ Audio not found. Try again.'
    )
    return ctx.scene.leave()
  }

  const cost = getVoiceTrainingCost()
  // Списание состоялось? Возврат в catch разрешён только при true: проверка
  // баланса ниже означает «денег хватало», а не «деньги списаны». Ошибка ДО
  // списания иначе оборачивалась возвратом несписанного — класс «возврат без
  // списания», docs/audit/first-touch.md (126 из 171 возврата).
  let charged = false
  // Возврат уже выполнялся? Если reply внутри refundAndTell бросит ПОСЛЕ
  // успешного начисления, внешний catch не должен начислить второй раз.
  let refundHandled = false

  try {
    // 1. Проверка баланса
    const balance = await getUserBalance(telegramId)
    if (balance < cost) {
      // A refusal that names the price hands over the way to pay it. The
      // person asked for something paid and was told the only obstacle is
      // money -- the highest-intent moment there is, and it carried nothing
      // to press.
      await ctx.reply(
        isRu
          ? `❌ Недостаточно средств.\n\nТребуется: ${cost}⭐\nВаш баланс: ${balance}⭐`
          : `❌ Insufficient funds.\n\nRequired: ${cost}⭐\nYour balance: ${balance}⭐`,
        standardButtons(isRu)
      )
      return ctx.scene.leave()
    }

    // 2. Списание баланса
    charged = await updateUserBalance(
      telegramId,
      cost,
      PaymentType.MONEY_OUTCOME,
      'Voice training'
    )
    if (!charged) {
      // Результат раньше выбрасывался: отказ списания (гонка баланса,
      // отклонённая вставка) запускал обучение бесплатно — тот же класс,
      // из-за которого три визарда годами не списывали (SERVICE_PAYMENT).
      logger.error('[VOICE_TRAINING] Charge failed — training not started', {
        telegramId,
        cost,
      })
      await ctx.reply(
        isRu
          ? '❌ Не удалось списать средства. Попробуйте ещё раз.'
          : '❌ Failed to deduct the stars. Please try again.'
      )
      return ctx.scene.leave()
    }

    logger.info('[VOICE_TRAINING] Balance deducted', {
      telegramId,
      cost,
      newBalance: balance - cost,
    })

    // 3. Получение URL файла и загрузка в Storage
    const fileLink = await ctx.telegram.getFileLink(state.audioFileId)
    const audioUrl = fileLink.href

    // Загрузка в Supabase Storage
    const response = await fetch(audioUrl)
    const audioBuffer = await response.arrayBuffer()
    const fileName = `voice_training/${telegramId}/${Date.now()}.ogg`

    // Voice recording is biometric PII, same class as the face-training ZIP
    // (#1137). It used to land in the PUBLIC `images` bucket and be handed out
    // via getPublicUrl — a permanent, unauthenticated link to the user's voice.
    // Use a PRIVATE bucket + a short-lived signed URL instead.
    const TRAINING_BUCKET = 'training-private'
    await supabase.storage
      .createBucket(TRAINING_BUCKET, { public: false })
      .catch(() => ({})) // idempotent — the upload below is the real gate

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(TRAINING_BUCKET)
      .upload(fileName, audioBuffer, {
        contentType: 'audio/ogg',
        upsert: true,
      })

    if (uploadError) {
      logger.error('[VOICE_TRAINING] Failed to upload audio', {
        telegramId,
        error: uploadError.message,
      })
      // Возврат. Сообщение зависит от того, прошло ли начисление на самом деле.
      refundHandled = true
      await refundAndTell({
        ctx,
        telegramId,
        amount: cost,
        description: 'Voice training refund - upload error',
        reason: { ru: 'Ошибка загрузки аудио', en: 'Audio upload error' },
        isRu,
        type: PaymentType.REFUND,
      })
      return ctx.scene.leave()
    }

    // Short-lived SIGNED URL (7 days) instead of a permanent public one. The
    // training provider fetches it at start (well within the window); the DB
    // audio_url column is write-only (only model_url is read back for covers),
    // so an eventual expiry is harmless. Fail closed — no public fallback.
    const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7
    const { data: signedData, error: signedError } = await supabase.storage
      .from(TRAINING_BUCKET)
      .createSignedUrl(fileName, SIGNED_URL_TTL_SECONDS)

    if (signedError || !signedData?.signedUrl) {
      logger.error('[VOICE_TRAINING] Failed to sign audio URL', {
        telegramId,
        error: signedError?.message || 'no signed URL returned',
      })
      refundHandled = true
      await refundAndTell({
        ctx,
        telegramId,
        amount: cost,
        description: 'Voice training refund - sign error',
        reason: { ru: 'Ошибка загрузки аудио', en: 'Audio upload error' },
        isRu,
        type: PaymentType.REFUND,
      })
      return ctx.scene.leave()
    }

    const storedAudioUrl = signedData.signedUrl

    // 4. Создание записи в БД
    const modelName = `voice_${telegramId}_${Date.now()}`
    const voiceModel = await createVoiceModel({
      telegram_id: telegramId,
      model_name: modelName,
      audio_url: storedAudioUrl,
      status: 'pending',
    })

    // 5. Отправка в Inngest
    await sendInngestEvent('voice/training.start' as any, {
      voiceModelId: voiceModel.id,
      telegram_id: telegramId,
      audioUrl: storedAudioUrl,
      modelName,
      bot_name: ctx.botInfo?.username || 'neuro_blogger_bot',
    })

    logger.info('[VOICE_TRAINING] Training started', {
      telegramId,
      voiceModelId: voiceModel.id,
      modelName,
    })

    await ctx.reply(
      isRu
        ? `✅ Обучение голоса запущено!\n\n` +
            `⏱️ Это займёт 5-10 минут.\n` +
            `📬 Вы получите уведомление, когда модель будет готова.\n\n` +
            `После этого вы сможете создавать AI Cover в разделе "🎧 AI Cover".`
        : `✅ Voice training started!\n\n` +
            `⏱️ This will take 5-10 minutes.\n` +
            `📬 You will be notified when the model is ready.\n\n` +
            `After that you can create AI Covers in "🎧 AI Cover" section.`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            isRu ? '🏠 В меню' : '🏠 To menu',
            'back_to_menu'
          ),
        ],
      ])
    )

    return ctx.scene.leave()
  } catch (error) {
    logger.error('[VOICE_TRAINING] Error starting training', {
      telegramId,
      error: error instanceof Error ? error.message : String(error),
    })

    if (charged && !refundHandled) {
      // Раньше результат возврата выбрасывался (updateUserBalance не бросает,
      // а возвращает false — try/catch вокруг него ничего не ловил), и
      // «Средства возвращены» говорилось, не зная этого. Сообщение теперь
      // зависит от того, вернулись ли звёзды на самом деле.
      await refundAndTell({
        ctx,
        telegramId,
        amount: cost,
        description: 'Voice training refund - error',
        reason: { ru: 'Произошла ошибка', en: 'An error occurred' },
        isRu,
        type: PaymentType.REFUND,
      })
    } else if (!charged) {
      // Списания не было — возвращать нечего.
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка. Средства не списывались.'
          : '❌ An error occurred. No funds were deducted.'
      )
    } else {
      // Возврат уже отработан веткой выше, упала только доставка сообщения —
      // о деньгах не утверждаем ничего, чтобы не соврать.
      await ctx.reply(isRu ? '❌ Произошла ошибка.' : '❌ An error occurred.')
    }
    return ctx.scene.leave()
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// HEARS HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

voiceTrainingWizard.hears(
  ['🏠 Главное меню', '🏠 Main menu', '/menu'],
  async ctx => {
    await ctx.scene.leave()
    return showMainMenu(ctx)
  }
)

export default voiceTrainingWizard
