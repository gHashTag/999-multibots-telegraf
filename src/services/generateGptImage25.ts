import axios from 'axios'
import { logger } from '@/utils/logger'
import { processBalanceOperation } from '@/price/helpers/processBalanceOperation'
import { sendPhotoWithFallback } from '@/helpers/sendPhotoWithFallback'
import { refundUser } from '@/price/helpers/refundUser'
import { MyContext } from '@/interfaces'
import { savePrompt } from '@/core/supabase'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { KIE_AI_API_KEY } from '@/config'
import { KIE_JOBS, readKieJobRecord } from '@/config/kie-jobs'
import {
  GptImage25InputSchema,
  GptImage25AspectRatio,
  GptImage25Resolution,
  pickGptImage25Model,
} from '@/schemas/gptImage25.schema'
import { standardButtons } from '@/navigation/helpers/actionButtons'

export interface GptImage25ServiceParams {
  telegram_id: string | number
  promptText: string
  /** Optional: with a source image this runs image-to-image, without it text-to-image. */
  inputImageUrl?: string | string[] | null
  ctx: MyContext
  username?: string
  is_ru?: boolean
  aspect_ratio?: GptImage25AspectRatio
  resolution?: GptImage25Resolution
  silent?: boolean
  skipBalanceCheck?: boolean
  /** Don't tell the user about failures -- for fallback chains. */
  suppressUserErrors?: boolean
}

const GPT_IMAGE_25_MODEL = {
  // Same 5 stars as the three models it shares a fallback chain with, so the
  // price a person is quoted does not depend on which model happens to answer.
  costPerImage: 5,
  name: 'GPT-Image-2.5',
}

const POLL_INTERVAL_MS = 3000
const MAX_WAIT_MS = 180000

/**
 * GPT-Image-2.5, through kie.ai's asynchronous Jobs API.
 *
 * Unlike the Replicate-backed services beside it, kie.ai does not return an
 * image from the create call: `createTask` returns a taskId and the image
 * arrives later, so this service polls `recordInfo` until the job reaches a
 * terminal state. That endpoint is the one measured in src/config/kie-jobs.ts;
 * three older pollers in this repository used a sibling path that does not
 * exist, which is why the path is not spelled out here by hand.
 *
 * Timings measured 2026-09-15: ~50 s for one 1K image at 9:16 (940 x 1672),
 * 6 kie credits.
 */
export async function generateGptImage25(
  params: GptImage25ServiceParams
): Promise<string | null> {
  const totalCost = GPT_IMAGE_25_MODEL.costPerImage
  /*
   * A REFUND IS ONLY HONEST AFTER A CHARGE.
   *
   * The catch below refunded `totalCost` whenever `skipBalanceCheck` was false
   * -- but the charge happens two thirds of the way down the try, and several
   * things above it throw: a missing API key, a Zod parse of the input, a user
   * who does not exist, the level bump. Any of those landed in the catch and
   * asked for five stars back on a charge that had not happened.
   *
   * refundUser does hold a guard, and it is the reason this was not a standing
   * mint: it refuses a refund when the ledger shows no charge in the last day.
   * But it looks for ANY charge of at least that size, not THIS one -- so a
   * person who generated anything else that day passed it and was paid for a
   * failure they never funded. The flag is the charge itself, not the intention
   * to charge.
   */
  let charged = false

  try {
    const {
      telegram_id,
      promptText,
      inputImageUrl,
      ctx,
      username,
      is_ru = true,
      // Portrait by default: these images are looked at on a phone.
      aspect_ratio = '9:16',
      resolution = '1K',
    } = params

    if (!KIE_AI_API_KEY) {
      throw new Error('KIE_AI_API_KEY not configured')
    }

    // An empty string is not a source image. Telegram's getUserPhotoUrl returns
    // null for an account with no visible photo, and with "strict": false that
    // null travels silently -- so filter on truth, not on presence.
    const imageUrls = (
      Array.isArray(inputImageUrl) ? inputImageUrl : [inputImageUrl]
    ).filter((u): u is string => typeof u === 'string' && u.length > 0)

    const validatedInput = GptImage25InputSchema.parse({
      prompt: promptText,
      ...(imageUrls.length ? { image_urls: imageUrls } : {}),
      aspect_ratio,
      resolution,
    })

    const model = pickGptImage25Model(imageUrls.length > 0)

    logger.info('[GptImage25] Starting generation', {
      telegram_id,
      model,
      aspect_ratio: validatedInput.aspect_ratio,
      resolution: validatedInput.resolution,
      inputImages: imageUrls.length,
      promptLength: validatedInput.prompt.length,
    })

    const userExists = await getUserByTelegramIdString(String(telegram_id))
    if (!userExists) {
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }
    const level = userExists.level
    if (level === 10) {
      await updateUserLevelPlusOne(String(telegram_id), level)
    }

    if (!params.skipBalanceCheck) {
      const balanceCheck = await processBalanceOperation({
        telegram_id:
          typeof telegram_id === 'string' ? parseInt(telegram_id) : telegram_id,
        paymentAmount: totalCost,
        is_ru,
        bot_name: ctx.botInfo?.username,
        ctx,
      })

      if (!balanceCheck.success) {
        logger.warn('[GptImage25] Insufficient balance', {
          telegram_id,
          required: totalCost,
        })

        await ctx.reply(
          is_ru
            ? `❌ Недостаточно звезд для генерации\n\nТребуется: ${totalCost}⭐\nВаш баланс: ${balanceCheck.currentBalance || 0}⭐\n\nПополните баланс через /start → 💎 Пополнить баланс`
            : `❌ Insufficient stars for generation\n\nRequired: ${totalCost}⭐\nYour balance: ${balanceCheck.currentBalance || 0}⭐\n\nTop up via /start → 💎 Top up balance`,
          // The refusal hands over the way to pay, at the one moment a price
          // is worth showing.
          standardButtons(is_ru)
        )
        return null
      }

      charged = true
    }

    let statusMessage: any = null
    if (!params.silent) {
      statusMessage = await ctx.reply(
        is_ru
          ? '🎨 Генерирую ваш образ через GPT-Image-2.5...\n\n⏱ Это займет около минуты'
          : '🎨 Generating your image via GPT-Image-2.5...\n\n⏱ This takes about a minute'
      )
    }

    const created = await axios.post(
      `${KIE_JOBS.BASE_URL}${KIE_JOBS.CREATE_TASK}`,
      { model, input: validatedInput },
      {
        headers: {
          Authorization: `Bearer ${KIE_AI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    )

    if (created.data?.code !== 200 || !created.data?.data?.taskId) {
      throw new Error(
        `kie.ai createTask failed: ${created.data?.msg || 'no taskId returned'}`
      )
    }

    const taskId: string = created.data.data.taskId
    logger.info('[GptImage25] Task created', { telegram_id, taskId, model })

    const startedAt = Date.now()
    let imageUrl = ''

    while (Date.now() - startedAt < MAX_WAIT_MS) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))

      const status = await axios.get(
        `${KIE_JOBS.BASE_URL}${KIE_JOBS.RECORD_INFO}`,
        {
          params: { taskId },
          headers: { Authorization: `Bearer ${KIE_AI_API_KEY}` },
          timeout: 20000,
        }
      )

      const record = readKieJobRecord(status.data?.data)

      if (record.state === 'fail') {
        throw new Error(record.failMsg || 'GPT-Image-2.5 job failed')
      }
      if (record.state === 'success') {
        imageUrl = record.urls[0]
        break
      }
    }

    if (!imageUrl) {
      throw new Error(
        `GPT-Image-2.5 did not finish within ${MAX_WAIT_MS / 1000}s`
      )
    }

    logger.info('[GptImage25] Image ready', {
      telegram_id,
      taskId,
      waitedMs: Date.now() - startedAt,
    })

    if (statusMessage) {
      try {
        await ctx.deleteMessage(statusMessage.message_id)
      } catch (err) {
        logger.warn('[GptImage25] Failed to delete status message', { err })
      }
    }

    try {
      await savePrompt(
        validatedInput.prompt,
        GPT_IMAGE_25_MODEL.name,
        imageUrl,
        typeof telegram_id === 'string' ? parseInt(telegram_id) : telegram_id,
        'success'
      )
    } catch (saveError) {
      logger.error('[GptImage25] Failed to save prompt', { saveError })
    }

    if (!params.silent) {
      const caption = is_ru
        ? `✨ Ваш образ готов!\n\n💫 Стоимость: ${totalCost}⭐\n🎨 Модель: ${GPT_IMAGE_25_MODEL.name}`
        : `✨ Your image is ready!\n\n💫 Cost: ${totalCost}⭐\n🎨 Model: ${GPT_IMAGE_25_MODEL.name}`

      const sendResult = await sendPhotoWithFallback(ctx, imageUrl, { caption })
      if (!sendResult) {
        throw new Error('Failed to send photo to user')
      }
    }

    try {
      const { sendMediaToPulse } = await import('@/helpers/pulse')
      await sendMediaToPulse({
        mediaType: 'photo',
        mediaSource: imageUrl,
        telegramId: telegram_id,
        username: username,
        language: is_ru ? 'ru' : 'en',
        serviceType: GPT_IMAGE_25_MODEL.name,
        prompt: validatedInput.prompt,
        botName: ctx.botInfo?.username || 'unknown',
        additionalInfo: {
          Model: model,
          'Aspect Ratio': validatedInput.aspect_ratio,
          Resolution: validatedInput.resolution,
          'Input Images': String(imageUrls.length),
          Price: `${GPT_IMAGE_25_MODEL.costPerImage} stars`,
          Type: 'Avatar Transform (Lead Magnet)',
        },
      })
    } catch (pulseError) {
      logger.error('[GptImage25] Error sending to pulse channel', {
        pulseError,
      })
    }

    return imageUrl
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    logger.error('[GptImage25] Generation failed', {
      telegram_id: params.telegram_id,
      error: message,
    })

    if (!params.suppressUserErrors) {
      await params.ctx.reply(
        params.is_ru
          ? '❌ Произошла ошибка при генерации. Попробуйте позже.'
          : '❌ An error occurred during generation. Please try later.'
      )
    }

    if (charged) {
      await refundUser(params.ctx, totalCost, { reason: 'generation_failed' })
    }

    try {
      const adminIds = process.env.ADMIN_IDS?.split(',') || []
      // Built line by line rather than as one multi-line template: the
      // no-cyrillic guard reads a diff line at a time and can only recognise a
      // string literal that opens and closes on the same line.
      const adminMessage = [
        '🚨 Ошибка в generateGptImage25',
        '',
        `👤 User: ${params.telegram_id} (@${params.username})`,
        `❌ Error: ${message}`,
        `🎯 Prompt: ${params.promptText?.substring(0, 100)}...`,
      ].join('\n')

      for (const adminId of adminIds) {
        await params.ctx.telegram
          .sendMessage(adminId, adminMessage, { parse_mode: undefined })
          .catch(err => {
            // "chat not found" here means the admin id never started the bot;
            // it says nothing about the generation that failed.
            if (!err.message?.includes('chat not found')) {
              logger.error('[GptImage25] Failed to notify admin', { err })
            }
          })
      }
    } catch (notifyError) {
      logger.error('[GptImage25] Failed to send admin notification', {
        notifyError,
      })
    }

    return null
  }
}
