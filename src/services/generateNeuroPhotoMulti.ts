import axios, { isAxiosError } from 'axios'
import { SECRET_API_KEY } from '@/config'
import { getAiServerUrl } from '@/config/aiServer'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { MyContext, ModelUrl } from '@/interfaces'
import { logger } from '@/utils/logger'
import { generateNeuroPhotoDirect } from './generateNeuroPhotoDirect'
import { getUserBalance } from '@/core/supabase'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { ModeEnum } from '@/interfaces/modes'
import { Markup } from 'telegraf'
import {
  ACTION_PREFIX,
  topupButtonLabel,
} from '@/navigation/helpers/actionButtons'
import { remainingBalanceLine } from '@/price/helpers/remainingBalanceLine'

// Enhanced keyboard for multi-image results
const createMultiNeuroPhotoResultKeyboard = (
  is_ru: boolean,
  imageIndex: number,
  totalImages: number
) => {
  const buttons = []

  // Navigation buttons for multiple images
  if (totalImages > 1) {
    const navRow = []
    if (imageIndex > 0) {
      navRow.push(
        Markup.button.callback('⬅️', `multi_neurophoto_nav_${imageIndex - 1}`)
      )
    }

    navRow.push(
      Markup.button.callback(
        `${imageIndex + 1}/${totalImages}`,
        'multi_neurophoto_info'
      )
    )

    if (imageIndex < totalImages - 1) {
      navRow.push(
        Markup.button.callback('➡️', `multi_neurophoto_nav_${imageIndex + 1}`)
      )
    }

    if (navRow.length > 0) {
      buttons.push(navRow)
    }
  }

  // Action buttons
  buttons.push([
    Markup.button.callback(
      is_ru ? '🆕 Новая серия' : '🆕 New series',
      'new_multi_neurophoto'
    ),
    Markup.button.callback(
      is_ru ? '📐 Изменить размер' : '📐 Change size',
      'change_size'
    ),
  ])

  buttons.push([
    Markup.button.callback(
      is_ru ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt',
      'improve_prompt'
    ),
  ])

  buttons.push([
    // The one place a person has just seen what this is worth. Measured
    // 2026-09-08: of everyone who ever generates, about one in five ever
    // reaches a price. act:topup is caught at bot level, and inside
    // neuroPhotoWizard -- the only scene that swallows unknown presses -- by
    // an explicit branch.
    Markup.button.callback(topupButtonLabel(is_ru), `${ACTION_PREFIX}topup`),
    Markup.button.callback(
      is_ru ? '🏠 Главное меню' : '🏠 Main menu',
      'go_main_menu'
    ),
  ])

  return Markup.inlineKeyboard(buttons)
}

/**
 * Enhanced function for generating multiple neurophotos
 * Supports both single and multi-image generation with optimized processing
 */
export async function generateNeuroPhotoMulti(
  prompt: string,
  model_url: ModelUrl,
  numImages: number,
  telegram_id: string,
  ctx: MyContext,
  botName: string,
  explicitAspectRatio?: string | null,
  imageUrls?: string[] // NEW: Support for multiple input images
): Promise<{
  data: string
  success: boolean
  urls?: string[]
  processedCount?: number
} | null> {
  const isMultiImage = imageUrls && imageUrls.length > 1
  const actualImageCount = isMultiImage ? imageUrls!.length : numImages

  logger.info('🔄 [MULTI] Starting multi-neurophoto generation', {
    telegram_id,
    numImages,
    actualImageCount,
    isMultiImage,
    inputImagesCount: imageUrls?.length || 0,
    prompt: prompt.substring(0, 50) + '...',
    model_url,
    botName,
  })

  // Validate input data
  if (!ctx.session.prompt && !isMultiImage) {
    console.error('❌ [MULTI] Prompt not found in session')
    throw new Error('Prompt not found')
  }

  if (!ctx.session.userModel) {
    console.error('❌ [MULTI] User model not found in session')
    throw new Error('User model not found')
  }

  if (actualImageCount <= 0) {
    console.error('❌ [MULTI] Invalid number of images:', actualImageCount)
    throw new Error('Invalid number of images')
  }

  // Calculate cost for multiple images
  const costResult = calculateModeCost({
    mode: ModeEnum.NeuroPhoto,
    steps: actualImageCount,
  })
  const exactCostPerImage = Number(costResult.stars) // 7.5⭐
  const exactTotalCost = exactCostPerImage * actualImageCount

  logger.info('💰 [MULTI] Calculated cost for multiple images', {
    exactCostPerImage,
    exactTotalCost,
    actualImageCount,
    isMultiImage,
  })

  // Send processing notification
  const isRu = isRussianFromState(ctx)

  // Full-batch payment gate. PLAN B charges each image separately and passes
  // bypass_payment_check=true for images 2..N, which SKIPS the balance gate but
  // still inserts the charge — so a user who cannot afford the series was charged
  // into the negative and got the extra images for free. All N images are charged,
  // so refuse the whole series up front unless the full cost is affordable. This
  // only PREVENTS charging/delivery; it never adds a charge. (Residual: a
  // concurrent spend between this check and the loop is a narrow TOCTOU — the
  // atomic per-op deduct RPC is #999, owner-side.)
  const currentBalance = await getUserBalance(telegram_id)
  if (currentBalance < exactTotalCost) {
    await ctx.reply(
      isRu
        ? `Недостаточно звёзд для серии из ${actualImageCount} фото: нужно ${exactTotalCost} ⭐, на балансе ${currentBalance} ⭐.`
        : `Not enough stars for a series of ${actualImageCount} photos: need ${exactTotalCost} ⭐, you have ${currentBalance} ⭐.`
    )
    return null
  }

  if (isMultiImage) {
    await ctx.reply(
      isRu
        ? `🎨 Генерирую серию из ${actualImageCount} нейрофото...\n⏱️ Это может занять несколько минут\n💎 Стоимость: ${exactTotalCost} ⭐`
        : `🎨 Generating series of ${actualImageCount} neurophotos...\n⏱️ This may take several minutes\n💎 Cost: ${exactTotalCost} ⭐`
    )
  }

  try {
    // PLAN A: Try server processing
    //
    // Пропускаем План А, если отдельного AI-сервера нет. В проде
    // API_SERVER_URL НЕ ЗАДАНА, и шаблон ниже давал строку
    // "undefined/generate/neuro-photo-multi": axios падал с ERR_INVALID_URL
    // на каждом запросе. Результат человек всё равно получал по Плану Б, но в
    // логах оставалась ошибка, неотличимая от сетевой, — при разборе
    // инцидентов она уводит в сторону.
    //
    // Бросаем, а не возвращаем: ниже стоит catch, который и есть переход к
    // Плану Б. Отдельная ветка выхода дублировала бы его.
    const aiServerUrl = getAiServerUrl()
    if (!aiServerUrl) {
      logger.info('⏭️ [MULTI] Отдельный AI-сервер не настроен — сразу План Б', {
        telegram_id,
        description: 'AI server is not configured; skipping Plan A entirely',
      })
      throw new Error('AI server is not configured')
    }

    logger.info('🌐 [MULTI] Attempting server processing', {
      telegram_id,
    })

    await ctx.telegram.sendChatAction(ctx.chat.id, 'typing')

    const url = `${aiServerUrl}/generate/neuro-photo-multi`

    const serverPayload = {
      prompt,
      model_url,
      num_images: numImages,
      telegram_id,
      username: ctx.from?.username,
      is_ru: isRu,
      bot_name: botName,
      exact_cost_per_image: exactCostPerImage,
      exact_total_cost: exactTotalCost,
      user_model: ctx.session.userModel,
      aspect_ratio: explicitAspectRatio,
      // NEW: Multi-image support
      is_multi_image: isMultiImage,
      input_image_urls: imageUrls,
      actual_image_count: actualImageCount,
    }

    logger.info('📤 [MULTI] Sending multi-image data to server', {
      url,
      isMultiImage,
      actualImageCount,
      inputImagesCount: imageUrls?.length || 0,
    })

    const response = await axios.post(url, serverPayload, {
      headers: {
        'Content-Type': 'application/json',
        'x-secret-key': SECRET_API_KEY,
      },
      timeout: 60000, // Extended timeout for multi-image processing
    })

    logger.info('✅ [MULTI] Server responded successfully', {
      telegram_id,
      response_status: response.status,
    })

    // Process server response
    if (!response.data) {
      throw new Error('Server returned empty response')
    }

    if (response.data.error) {
      throw new Error(`Server error: ${response.data.error}`)
    }

    if (
      response.data.urls &&
      Array.isArray(response.data.urls) &&
      response.data.urls.length > 0
    ) {
      // Server returned ready images
      logger.info('📸 [MULTI] Sending multiple photos to user', {
        telegram_id,
        urls_count: response.data.urls.length,
      })

      // Save last URL for upscaler
      const lastUrl = response.data.urls[response.data.urls.length - 1]
      if (ctx.session) {
        ctx.session.lastNeuroPhotoImageUrl = lastUrl
        ctx.session.lastNeuroPhotoPrompt = prompt
      }

      // Send photos with enhanced navigation
      // Read once, before the send loop: a photo each would be a query each.
      // Returns '' on any failure, so a balance read can never cost somebody
      // the result they already paid for.
      const leftLine = await remainingBalanceLine(telegram_id, isRu)

      for (let i = 0; i < response.data.urls.length; i++) {
        const url = response.data.urls[i]
        try {
          const caption = isRu
            ? `✨ Нейрофото ${i + 1}/${response.data.urls.length}\n\nСтоимость за изображение: ${exactCostPerImage} ⭐${leftLine}`
            : `✨ Neurophoto ${i + 1}/${response.data.urls.length}\n\nCost per image: ${exactCostPerImage} ⭐${leftLine}`

          await ctx.telegram.sendPhoto(
            telegram_id,
            { url },
            {
              caption,
              reply_markup: createMultiNeuroPhotoResultKeyboard(
                isRu,
                i,
                response.data.urls.length
              ).reply_markup,
            }
          )

          // Small delay between images
          if (i < response.data.urls.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        } catch (sendError) {
          logger.error('❌ [MULTI] Error sending photo', {
            telegram_id,
            url,
            index: i,
            error: sendError,
          })
        }
      }

      // Send completion summary
      if (response.data.urls.length > 1) {
        await ctx.reply(
          isRu
            ? `🎉 Серия готова! Сгенерировано ${response.data.urls.length} нейрофото\n💎 Общая стоимость: ${exactTotalCost} ⭐`
            : `🎉 Series complete! Generated ${response.data.urls.length} neurophotos\n💎 Total cost: ${exactTotalCost} ⭐`
        )
      }

      return {
        ...response.data,
        processedCount: response.data.urls.length,
      }
    } else if (response.data.jobId) {
      // Server accepted for async processing
      logger.info('✅ [MULTI] Server accepted for async processing', {
        telegram_id,
        jobId: response.data.jobId,
      })

      return response.data
    } else {
      throw new Error('Unexpected response format from server')
    }
  } catch (error) {
    // Log server error
    if (isAxiosError(error)) {
      logger.warn('⚠️ [MULTI] Server processing failed', {
        telegram_id,
        error_status: error.response?.status,
        error_message: error.response?.data?.error || error.message,
        error_code: error.code,
      })

      // Handle NSFW content
      if (error.response?.data?.error?.includes('NSFW')) {
        await ctx.reply(
          isRu
            ? 'Извините, генерация серии изображений не удалась из-за обнаружения неподходящего контента.'
            : 'Sorry, image series generation failed due to inappropriate content detection.'
        )
        return null
      }
    }

    // PLAN B: Fall back to local processing
    logger.info('🔄 [MULTI] Falling back to local processing', {
      telegram_id,
    })

    try {
      if (isMultiImage && imageUrls) {
        // Process multiple input images sequentially
        const results = []
        for (let i = 0; i < imageUrls.length; i++) {
          logger.info(
            `🔄 [MULTI] Processing image ${i + 1}/${imageUrls.length}`,
            {
              telegram_id,
            }
          )

          // Update progress
          await ctx.reply(
            isRu
              ? `🎨 Обрабатываю изображение ${i + 1}/${imageUrls.length}...`
              : `🎨 Processing image ${i + 1}/${imageUrls.length}...`
          )

          const localResult = await generateNeuroPhotoDirect(
            prompt,
            model_url,
            1, // One image at a time
            telegram_id,
            ctx,
            botName,
            explicitAspectRatio,
            {
              disable_telegram_sending: false,
              bypass_payment_check: i > 0, // Only charge for first image
            }
          )

          if (localResult && localResult.success) {
            results.push(localResult)
          } else {
            // Stop the series on any failure: images 2..N use
            // bypass_payment_check=true (no per-image gate), so continuing after a
            // failed image would charge the remaining ones with no gate. Break so a
            // mid-series stop cannot bill the rest.
            break
          }
        }

        return {
          data: 'Multi-image series completed',
          success: results.length > 0,
          processedCount: results.length,
        }
      } else {
        // Standard single or multiple image generation
        const localResult = await generateNeuroPhotoDirect(
          prompt,
          model_url,
          numImages,
          telegram_id,
          ctx,
          botName,
          explicitAspectRatio,
          {
            disable_telegram_sending: false,
            bypass_payment_check: false,
          }
        )

        return localResult
      }
    } catch (localError) {
      logger.error('❌ [MULTI] Both server and local processing failed', {
        telegram_id,
        server_error: String(error),
        local_error: String(localError),
      })

      await ctx.reply(
        isRu
          ? 'Произошла ошибка при генерации серии изображений. Пожалуйста, попробуйте позже.'
          : 'An error occurred during image series generation. Please try again later.'
      )

      return null
    }
  }
}
