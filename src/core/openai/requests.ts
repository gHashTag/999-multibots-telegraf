import { openai } from '.'
import { logger } from '@/utils/logger'

type UserData = {
  username: string
  first_name: string
  last_name: string
  company: string
  position: string
  designation: string
}

/**
 * ✅ ИСПОЛЬЗУЕТ ПЕРЕДАННУЮ МОДЕЛЬ ИЗ БД ЧЕРЕЗ OPENROUTER API
 * OpenRouter - универсальный шлюз для ВСЕХ моделей (DeepSeek, Claude, GPT, Gemini и т.д.)
 * Fallback на DeepSeek API только если OpenRouter недоступен
 *
 * ✅ ДЛЯ GEMINI 3 PRO: Если запрос на изображение - использует Nano Banana Pro
 *
 * @param ctx - Контекст Telegraf (опционально, нужен для проверки баланса и отправки сообщений)
 * @param telegramId - Telegram ID пользователя (опционально, нужен для проверки баланса)
 * @param isRu - Язык пользователя (опционально, нужен для сообщений)
 */
export const answerAi = async (
  model: string,
  userData: UserData,
  prompt: string,
  languageCode: string,
  systemPrompt?: string,
  ctx?: any,
  telegramId?: string,
  isRu?: boolean
): Promise<string | { type: 'image'; imageUrl: string; cost?: number }> => {
  const initialPrompt = `Respond in the language: ${languageCode} You communicate with: ${JSON.stringify(
    userData
  )}`

  logger.info('[answerAi] Using model from database via OpenRouter', {
    model,
    languageCode,
    hasSystemPrompt: !!systemPrompt,
  })

  // ✅ Определяем, является ли запрос запросом на генерацию изображения
  const isGeminiModel = model.toLowerCase().includes('gemini')
  const promptLower = prompt.toLowerCase().trim()
  const imageKeywords = [
    'сделай картинку',
    'нарисуй',
    'создай изображение',
    'сгенерируй картинку',
    'сгенерируй изображение',
    'создай картинку',
    'нарисуй картинку',
    'сделай изображение',
    'покажи картинку',
    'картинка',
    'make image',
    'draw',
    'create image',
    'generate image',
    'make picture',
    'create picture',
    'show image',
    'show picture',
    'picture',
  ]
  const isImageRequest = imageKeywords.some(keyword =>
    promptLower.includes(keyword)
  )

  // ✅ Если Gemini 3 Pro и запрос на изображение - используем Nano Banana Pro
  if (isGeminiModel && isImageRequest) {
    logger.info(
      '[answerAi] Gemini model + image request detected, using Nano Banana Pro',
      {
        model,
        prompt: prompt.substring(0, 50),
      }
    )

    // ✅ Проверка баланса и списание стоимости ПЕРЕД генерацией
    if (ctx && telegramId) {
      const { processBalanceOperation } = await import('@/price/helpers')
      const { imageModelPrices } = await import(
        '@/price/models/imageModelPrices'
      )

      // Получаем стоимость Nano Banana Pro
      const nanoBananaPrice = imageModelPrices['fal-ai/nano-banana-pro']
      const costPerImage = nanoBananaPrice?.costPerImage || 10 // Fallback на 10⭐ если цена не найдена

      logger.info(
        '[answerAi] Checking balance for Nano Banana Pro generation',
        {
          telegramId,
          costPerImage,
        }
      )

      const balanceCheck = await processBalanceOperation({
        ctx,
        telegram_id:
          typeof telegramId === 'string'
            ? parseInt(telegramId)
            : Number(telegramId),
        paymentAmount: costPerImage,
        is_ru: isRu || languageCode === 'ru',
        bot_name: ctx?.botInfo?.username,
      })

      if (!balanceCheck.success) {
        logger.warn('[answerAi] Insufficient balance for Nano Banana Pro', {
          telegramId,
          required: costPerImage,
          currentBalance: balanceCheck.currentBalance,
        })

        const errorMessage =
          isRu || languageCode === 'ru'
            ? `❌ Недостаточно звезд для генерации изображения\n\nТребуется: ${costPerImage}⭐\nВаш баланс: ${balanceCheck.currentBalance || 0}⭐\n\nПополните баланс через /start → 💎 Пополнить баланс`
            : `❌ Insufficient stars for image generation\n\nRequired: ${costPerImage}⭐\nYour balance: ${balanceCheck.currentBalance || 0}⭐\n\nTop up via /start → 💎 Top up balance`

        if (ctx) {
          await ctx.reply(errorMessage)
        }

        return errorMessage
      }

      logger.info(
        '[answerAi] Balance check successful, proceeding with generation',
        {
          telegramId,
          costPerImage,
          newBalance: balanceCheck.newBalance,
        }
      )
    }

    try {
      const { generateNanoBananaPro } = await import(
        '@/services/generateNanoBananaPro'
      )

      // Извлекаем промпт для изображения (убираем ключевые слова)
      let imagePrompt = prompt
      for (const keyword of imageKeywords) {
        imagePrompt = imagePrompt.replace(new RegExp(keyword, 'gi'), '').trim()
      }
      if (!imagePrompt) {
        imagePrompt = prompt
      }

      const result = await generateNanoBananaPro({
        prompt: imagePrompt,
        numImages: 1,
        aspectRatio: '9:16', // ✅ Дефолтный портретный формат для мобильных устройств
        resolution: '1K',
        telegramId,
      })

      if (result.images && result.images.length > 0) {
        logger.info('[answerAi] Nano Banana Pro image generated successfully', {
          imageUrl: result.images[0].url,
        })

        // ✅ Получаем стоимость для отображения в подписи
        const { imageModelPrices } = await import(
          '@/price/models/imageModelPrices'
        )
        const nanoBananaPrice = imageModelPrices['fal-ai/nano-banana-pro']
        const costPerImage = nanoBananaPrice?.costPerImage || 10

        // Возвращаем специальный объект для отправки изображения с информацией о стоимости
        return {
          type: 'image',
          imageUrl: result.images[0].url,
          cost: costPerImage,
        }
      } else {
        throw new Error('No images generated by Nano Banana Pro')
      }
    } catch (error) {
      logger.error('[answerAi] Nano Banana Pro generation failed', {
        error: error instanceof Error ? error.message : String(error),
      })

      // ✅ Если баланс был списан, нужно вернуть средства (через refundUser)
      if (ctx && telegramId) {
        try {
          const { refundUser } = await import('@/price/helpers')
          const { imageModelPrices } = await import(
            '@/price/models/imageModelPrices'
          )
          const nanoBananaPrice = imageModelPrices['fal-ai/nano-banana-pro']
          const costPerImage = nanoBananaPrice?.costPerImage || 10

          // ✅ Используем silent refund (не показываем сообщение пользователю)
          await refundUser(ctx, costPerImage, true)

          logger.info('[answerAi] Refunded balance after generation failure', {
            telegramId,
            amount: costPerImage,
          })
        } catch (refundError) {
          logger.error('[answerAi] Failed to refund balance', {
            telegramId,
            error: refundError,
          })
        }
      }

      // Fallback на обычный текстовый ответ
      return `Извините, не удалось сгенерировать изображение. ${error instanceof Error ? error.message : 'Попробуйте позже.'}`
    }
  }

  // ✅ Grok модели идут напрямую через xAI API (OpenAI-compatible)
  const isGrokModel = model.toLowerCase().includes('grok')
  const grokApiKey = process.env.GROK_API_KEY

  if (isGrokModel && grokApiKey) {
    try {
      logger.info('[answerAi] Sending request to xAI Grok API', { model })

      const response = await fetch(
        'https://api.x.ai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${grokApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'system',
                content: systemPrompt
                  ? systemPrompt + '\n' + initialPrompt
                  : initialPrompt,
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
          }),
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('[answerAi] xAI Grok API error', {
          status: response.status,
          error: errorText,
          model,
        })
        throw new Error(
          `xAI Grok API error: ${response.status} - ${errorText}`
        )
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content

      if (!content) {
        logger.error('[answerAi] Empty response from xAI Grok', {
          model,
          data,
        })
        throw new Error('Empty response from xAI Grok')
      }

      logger.info('[answerAi] Successfully got response from xAI Grok', {
        model,
        contentLength: content.length,
      })

      return content
    } catch (error) {
      logger.error(
        '[answerAi] xAI Grok request failed, falling back to OpenRouter',
        {
          model,
          error: error instanceof Error ? error.message : String(error),
        }
      )
      // Fallback на OpenRouter если xAI недоступен
    }
  }

  const openRouterApiKey = process.env.OPENROUTER_API_KEY

  // ✅ ВСЕ модели идут через OpenRouter API (включая DeepSeek, Claude, GPT и т.д.)
  if (openRouterApiKey) {
    try {
      logger.info('[answerAi] Sending request to OpenRouter API', { model })

      const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://three-head-dragon.shop',
            'X-Title': 'Vibee Bot',
          },
          body: JSON.stringify({
            model: model, // ✅ Используем переданную модель из БД (любую: DeepSeek, Claude, GPT, Gemini и т.д.)
            messages: [
              {
                role: 'system',
                content: systemPrompt
                  ? systemPrompt + '\n' + initialPrompt
                  : initialPrompt,
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
          }),
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('[answerAi] OpenRouter API error', {
          status: response.status,
          error: errorText,
          model,
        })
        throw new Error(
          `OpenRouter API error: ${response.status} - ${errorText}`
        )
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content

      if (!content) {
        logger.error('[answerAi] Empty response from OpenRouter', {
          model,
          data,
        })
        throw new Error('Empty response from OpenRouter')
      }

      logger.info('[answerAi] Successfully got response from OpenRouter', {
        model,
        contentLength: content.length,
      })

      return content
    } catch (error) {
      logger.error(
        '[answerAi] OpenRouter request failed, falling back to DeepSeek',
        {
          model,
          error: error instanceof Error ? error.message : String(error),
        }
      )
      // Fallback на DeepSeek только если OpenRouter недоступен
    }
  } else {
    logger.warn(
      '[answerAi] OPENROUTER_API_KEY not found, falling back to DeepSeek'
    )
  }

  // ✅ Fallback: используем DeepSeek API только если OpenRouter недоступен
  logger.info('[answerAi] Using DeepSeek API as fallback', {
    model: 'deepseek-chat',
  })

  const response = await openai.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content: systemPrompt
          ? systemPrompt + '\n' + initialPrompt
          : initialPrompt,
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  const content = response.choices[0].message.content
  if (!content) {
    throw new Error('Empty response from DeepSeek fallback')
  }

  return content
}
