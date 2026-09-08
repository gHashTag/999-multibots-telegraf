import { openai } from '.'
import { GLMProvider } from './glm-provider'
import { logger } from '@/utils/logger'
import { standardButtons } from '@/navigation/helpers/actionButtons'

/**
 * Цена одной картинки Nano Banana Pro — или `null`, если её нет в прайсе.
 *
 * Раньше в трёх местах стояло `nanoBananaPrice?.costPerImage || 10`. Если
 * запись о модели исчезала или переименовывалась, с человека списывали
 * десять звёзд, столько же показывали в сообщении и столько же возвращали —
 * то есть подмену нельзя было заметить ни человеку, ни по данным.
 */
async function nanoBananaPricePerImage(): Promise<number | null> {
  const { imageModelPrices } = await import('@/price/models/imageModelPrices')
  const price = imageModelPrices['fal-ai/nano-banana-pro']?.costPerImage
  return typeof price === 'number' && price > 0 ? price : null
}

type UserData = {
  username: string
  first_name: string
  last_name: string
  company: string
  position: string
  designation: string
}

/**
 * ✅ ОСНОВНАЯ МОДЕЛЬ: xAI Grok (grok-2-latest)
 * Fallback цепочка: Grok → GLM-4.7 → DeepSeek → OpenAI
 * Все текстовые запросы идут через AI API с fallback.
 * Gemini + изображения → Nano Banana Pro (как раньше)
 */

const GROK_DEFAULT_MODEL = 'grok-2-latest'

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
  // Untrusted Telegram profile fields (first_name / last_name / username, and
  // the free-typed company / position / designation) must NOT sit in a
  // role:'system' message: a crafted first_name there is prompt injection, the
  // same class as the businessBot #1129 fix. JSON.stringify escapes for JSON
  // validity, not for instruction. Keep only the trusted language directive in
  // the system prompt, and carry the sanitized user context in the user turn,
  // where the model does not treat it as an authoritative instruction.
  const sanitizeField = (v: string | undefined): string =>
    (v ?? '')
      .replace(/\p{C}/gu, ' ') // control chars incl. newlines / tabs
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 64)
  const safeUserData = {
    username: sanitizeField(userData.username),
    first_name: sanitizeField(userData.first_name),
    last_name: sanitizeField(userData.last_name),
    company: sanitizeField(userData.company),
    position: sanitizeField(userData.position),
    designation: sanitizeField(userData.designation),
  }
  const initialPrompt = `Respond in the language: ${languageCode}`
  const userMessage = `You communicate with: ${JSON.stringify(
    safeUserData
  )}\n\n${prompt}`

  const grokApiKey = process.env.GROK_API_KEY

  logger.info('[answerAi] Request received', {
    model,
    languageCode,
    hasGrokKey: !!grokApiKey,
  })

  // ✅ Gemini + изображение → Nano Banana Pro (без изменений)
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

  if (isGeminiModel && isImageRequest) {
    logger.info(
      '[answerAi] Gemini model + image request detected, using Nano Banana Pro',
      {
        model,
        prompt: prompt.substring(0, 50),
      }
    )

    if (ctx && telegramId) {
      const { processBalanceOperation } = await import('@/price/helpers')
      const { imageModelPrices } = await import(
        '@/price/models/imageModelPrices'
      )

      const nanoBananaPrice = imageModelPrices['fal-ai/nano-banana-pro']
      // ЦЕНА НЕ ВЫДУМЫВАЕТСЯ. Здесь стояло `|| 10`: если запись о модели
      // исчезала или переименовывалась, с человека списывали десять звёзд
      // независимо от настоящей стоимости. Отказать дешевле, чем списать не ту
      // сумму: отказ человек переживёт и повторит, деньги — нет.
      const costPerImage = nanoBananaPrice?.costPerImage
      if (typeof costPerImage !== 'number' || costPerImage <= 0) {
        logger.error(
          '❌ [NanoBananaPro] Цена модели неизвестна — генерация отменена',
          {
            alert: 'ЦЕНА НЕ ОПРЕДЕЛЕНА, СПИСАНИЯ НЕ БЫЛО',
            model: 'fal-ai/nano-banana-pro',
            telegramId: String(telegramId),
          }
        )
        await ctx?.reply?.(
          isRu || languageCode === 'ru'
            ? '❌ Не удалось определить стоимость генерации. Деньги не списаны, попробуйте позже.'
            : '❌ Could not determine the generation price. You have not been charged, please try later.'
        )
        return null
      }

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
        const errorMessage =
          isRu || languageCode === 'ru'
            ? `❌ Недостаточно звезд для генерации изображения\n\nТребуется: ${costPerImage}⭐\nВаш баланс: ${balanceCheck.currentBalance || 0}⭐\n\nПополните баланс через /start → 💎 Пополнить баланс`
            : `❌ Insufficient stars for image generation\n\nRequired: ${costPerImage}⭐\nYour balance: ${balanceCheck.currentBalance || 0}⭐\n\nTop up via /start → 💎 Top up balance`

        if (ctx) {
          // The refusal hands over the way to pay; standardButtons puts top-up first.
          await ctx.reply(
            errorMessage,
            standardButtons(Boolean(isRu || languageCode === 'ru'))
          )
        }
        return errorMessage
      }
    }

    try {
      const { generateNanoBananaPro } = await import(
        '@/services/generateNanoBananaPro'
      )

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
        aspectRatio: '9:16',
        resolution: '1K',
        telegramId,
      })

      if (result.images && result.images.length > 0) {
        const costPerImage = await nanoBananaPricePerImage()

        return {
          type: 'image',
          imageUrl: result.images[0].url,
          // Настоящая цена или ноль. Ноль честнее выдуманной десятки: он
          // виден в отчётах как «стоимость неизвестна», а не как списание.
          cost: costPerImage ?? 0,
        }
      } else {
        throw new Error('No images generated by Nano Banana Pro')
      }
    } catch (error) {
      logger.error('[answerAi] Nano Banana Pro generation failed', {
        error: error instanceof Error ? error.message : String(error),
      })

      if (ctx && telegramId) {
        try {
          const { refundUser } = await import('@/price/helpers')
          const costPerImage = await nanoBananaPricePerImage()
          if (costPerImage === null) {
            // Возврат на выдуманную сумму — это либо недоплата, либо
            // создание звёзд из воздуха. Лучше громко не вернуть, чем тихо
            // вернуть не столько.
            logger.error(
              '❌ [NanoBananaPro] Цена неизвестна — возврат не сделан',
              {
                alert: 'ВОЗВРАТ НЕ ВЫПОЛНЕН: НЕ ЗНАЕМ СУММУ',
                telegramId: String(telegramId),
              }
            )
          } else {
            await refundUser(ctx, costPerImage, {
              silent: true,
              reason: 'generation_failed',
            })
          }
        } catch (refundError) {
          logger.error('[answerAi] Failed to refund balance', {
            telegramId,
            error: refundError,
          })
        }
      }

      return `Извините, не удалось сгенерировать изображение. ${error instanceof Error ? error.message : 'Попробуйте позже.'}`
    }
  }

  // ✅ ОСНОВНОЙ ПУТЬ: xAI Grok API для ВСЕХ текстовых запросов
  if (grokApiKey) {
    try {
      const grokModel = GROK_DEFAULT_MODEL
      logger.info('[answerAi] Sending request to xAI Grok API', {
        model: grokModel,
      })

      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${grokApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: grokModel,
          messages: [
            {
              role: 'system',
              content: systemPrompt
                ? systemPrompt + '\n' + initialPrompt
                : initialPrompt,
            },
            {
              role: 'user',
              content: userMessage,
            },
          ],
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('[answerAi] xAI Grok API error', {
          status: response.status,
          error: errorText,
          model: grokModel,
        })
        throw new Error(`xAI Grok API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content

      if (!content) {
        logger.error('[answerAi] Empty response from xAI Grok', { data })
        throw new Error('Empty response from xAI Grok')
      }

      logger.info('[answerAi] Successfully got response from xAI Grok', {
        model: grokModel,
        contentLength: content.length,
      })

      return content
    } catch (error) {
      logger.error('[answerAi] xAI Grok request failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      // Fallback ниже
    }
  } else {
    logger.warn('[answerAi] GROK_API_KEY not found')
  }

  // ✅ Fallback 1: Z.AI coder model (OpenAI-compatible API)
  const glmApiKey = process.env.GLM_API_KEY
  if (glmApiKey) {
    try {
      logger.info('[answerAi] Using Z.AI coder model as fallback', {
        model: process.env.GLM_MODEL || 'glm-5.3',
      })

      const glmProvider = new GLMProvider(glmApiKey)
      const content = await glmProvider.chatCompletion([
        {
          role: 'system',
          content: systemPrompt
            ? systemPrompt + '\n' + initialPrompt
            : initialPrompt,
        },
        {
          role: 'user',
          content: userMessage,
        },
      ])

      return content
    } catch (glmError) {
      logger.error('[answerAi] Z.AI coder fallback failed', {
        error: glmError instanceof Error ? glmError.message : String(glmError),
      })
    }
  } else {
    logger.warn('[answerAi] GLM_API_KEY not found')
  }

  // ✅ Fallback 2: DeepSeek API
  try {
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
          content: userMessage,
        },
      ],
    })

    const content = response.choices[0].message.content
    if (!content) {
      throw new Error('Empty response from DeepSeek fallback')
    }

    return content
  } catch (deepseekError) {
    logger.error('[answerAi] DeepSeek fallback failed', {
      error:
        deepseekError instanceof Error
          ? deepseekError.message
          : String(deepseekError),
    })
  }

  // ✅ Fallback 2: OpenAI API (GPT-4o-mini)
  const openaiApiKey = process.env.OPENAI_API_KEY
  if (openaiApiKey) {
    try {
      logger.info('[answerAi] Using OpenAI API as final fallback', {
        model: 'gpt-4o-mini',
      })

      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: systemPrompt
                  ? systemPrompt + '\n' + initialPrompt
                  : initialPrompt,
              },
              {
                role: 'user',
                content: userMessage,
              },
            ],
          }),
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content

      if (!content) {
        throw new Error('Empty response from OpenAI fallback')
      }

      logger.info('[answerAi] Successfully got response from OpenAI fallback', {
        model: 'gpt-4o-mini',
        contentLength: content.length,
      })

      return content
    } catch (openaiError) {
      logger.error('[answerAi] OpenAI fallback also failed', {
        error:
          openaiError instanceof Error
            ? openaiError.message
            : String(openaiError),
      })
    }
  }

  throw new Error(
    'All AI providers failed (Grok, Z.AI coder, DeepSeek, OpenAI). Check API keys and balances.'
  )
}
