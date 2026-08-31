import { logger } from '@/utils/logger'
import { processBalanceOperation } from '@/price/helpers/processBalanceOperation'
import { refundAndTell } from '@/price/helpers/refundAndTell'
import { sendPhotoWithFallback } from '@/helpers/sendPhotoWithFallback'
import { MyContext } from '@/interfaces'

interface GeminiImageParams {
  telegram_id: string | number
  promptText: string
  inputImageUrl?: string
  ctx: MyContext
  username?: string
  is_ru?: boolean
}

/**
 * Генерация изображения через Google Gemini 2.5 Flash
 * Использует OpenRouter API для доступа к модели
 */
export async function generateGeminiImage({
  telegram_id,
  promptText,
  inputImageUrl,
  ctx,
  username,
  is_ru = true,
}: GeminiImageParams): Promise<string | null> {
  // Tracks the amount actually deducted (0 for a free/bypass generation), so a
  // failure below can refund exactly what was charged and never mint stars.
  let chargedAmount = 0
  try {
    logger.info('[generateGeminiImage] Starting generation', {
      telegram_id,
      promptLength: promptText.length,
      hasInputImage: !!inputImageUrl,
      username,
    })

    // Цена за одну генерацию (как было для FLUX Kontext Max)
    const costPerImage = 12

    // Проверяем баланс и списываем звезды
    const balanceCheck = await processBalanceOperation({
      telegram_id:
        typeof telegram_id === 'string' ? parseInt(telegram_id) : telegram_id,
      paymentAmount: costPerImage,
      is_ru,
      bot_name: ctx.botInfo?.username,
      ctx,
    })

    if (!balanceCheck.success) {
      logger.warn('[generateGeminiImage] Insufficient balance', {
        telegram_id,
        required: costPerImage,
      })

      await ctx.reply(
        is_ru
          ? `❌ Недостаточно звезд для генерации\\n\\nТребуется: ${costPerImage}⭐\\nВаш баланс: ${balanceCheck.currentBalance || 0}⭐\\n\\nПополните баланс через /start → 💎 Пополнить баланс`
          : `❌ Insufficient stars for generation\\n\\nRequired: ${costPerImage}⭐\\nYour balance: ${balanceCheck.currentBalance || 0}⭐\\n\\nTop up via /start → 💎 Top up balance`,
        { parse_mode: 'MarkdownV2' }
      )
      return null
    }

    // A real charge (not a free/bypass generation) was made — remember how much,
    // to refund it if generation fails below. paymentAmount is 0 on a bypass.
    chargedAmount = balanceCheck.paymentAmount ?? 0

    // Отправляем статус
    const statusMessage = await ctx.reply(
      is_ru
        ? '🎨 Генерирую ваш образ через Google Gemini 2.5 Flash...\\n⏱ Это займет 10-20 секунд'
        : '🎨 Generating your image via Google Gemini 2.5 Flash...\\n⏱ This will take 10-20 seconds',
      { parse_mode: 'MarkdownV2' }
    )

    // Формируем запрос к OpenRouter API
    const openRouterApiKey = process.env.OPENROUTER_API_KEY
    if (!openRouterApiKey) {
      throw new Error('OPENROUTER_API_KEY not configured')
    }

    // Поскольку FLUX не поддерживает входные изображения через OpenRouter,
    // используем Replicate API напрямую
    if (inputImageUrl) {
      // Используем Replicate для img2img
      const Replicate = (await import('replicate')).default
      const replicate = new Replicate({
        auth: process.env.REPLICATE_API_TOKEN,
      })

      const output = await replicate.run('black-forest-labs/flux-1.1-pro', {
        input: {
          prompt: promptText,
          image: inputImageUrl,
          num_outputs: 1,
          aspect_ratio: '9:16',
          output_format: 'jpg',
          output_quality: 90,
        },
      })

      const imageUrl = Array.isArray(output) ? output[0] : output
      return imageUrl as string
    }

    // Вместо Gemini используем Flux через OpenRouter
    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://t.me/AI_STARS_bot',
          'X-Title': 'AI Stars Bot',
        },
        body: JSON.stringify({
          model: 'black-forest-labs/flux-1.1-pro', // Используем FLUX для генерации
          messages: [
            {
              role: 'user',
              content: promptText,
            },
          ],
          temperature: 0.7,
          max_tokens: 1024,
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} - ${errorData}`)
    }

    const result = await response.json()

    // Извлекаем URL сгенерированного изображения
    const imageUrl = result.choices?.[0]?.message?.content

    if (!imageUrl) {
      throw new Error('No image URL in response')
    }

    logger.info('[generateGeminiImage] Image generated successfully', {
      telegram_id,
      imageUrl: imageUrl.substring(0, 50) + '...',
    })

    // Удаляем сообщение о статусе
    try {
      await ctx.deleteMessage(statusMessage.message_id)
    } catch (err) {
      logger.warn('[generateGeminiImage] Failed to delete status message', {
        err,
      })
    }

    // Отправляем изображение пользователю
    const caption = is_ru
      ? `✨ *Ваш образ готов!*\\n\\n💫 Стоимость: ${costPerImage}⭐\\n\\n_Создайте еще образы через_ /start`
      : `✨ *Your image is ready!*\\n\\n💫 Cost: ${costPerImage}⭐\\n\\n_Create more images via_ /start`

    const delivered = await sendPhotoWithFallback(ctx, imageUrl, {
      caption,
      parse_mode: 'MarkdownV2',
    })

    if (!delivered) {
      // sendPhotoWithFallback returns false on failure — it NEVER throws, so a
      // delivery failure would otherwise skip the catch below and leave the
      // user charged for an image they never received. Refund the charge here.
      if (chargedAmount > 0) {
        await refundAndTell({
          ctx,
          telegramId: String(telegram_id),
          amount: chargedAmount,
          description: 'Gemini image refund - delivery error',
          reason: {
            ru: 'Не удалось отправить сгенерированное изображение',
            en: 'Could not deliver the generated image',
          },
          isRu: is_ru,
        })
      }
      return null
    }

    return imageUrl
  } catch (error) {
    logger.error('[generateGeminiImage] Generation failed', {
      telegram_id,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    if (chargedAmount > 0) {
      // The stars were charged before generation (processBalanceOperation).
      // Generation failed after the charge, so refund the exact amount —
      // otherwise the user pays for an image they never received (same class as
      // faceSwap #1166). refundAndTell also tells the user the truth.
      await refundAndTell({
        ctx,
        telegramId: String(telegram_id),
        amount: chargedAmount,
        description: 'Gemini image refund - generation error',
        reason: {
          ru: 'Не удалось сгенерировать изображение',
          en: 'Image generation failed',
        },
        isRu: is_ru,
      })
    } else {
      await ctx.reply(
        is_ru
          ? '❌ Произошла ошибка при генерации. Попробуйте позже.'
          : '❌ An error occurred during generation. Please try later.',
        { parse_mode: 'MarkdownV2' }
      )
    }

    return null
  }
}
