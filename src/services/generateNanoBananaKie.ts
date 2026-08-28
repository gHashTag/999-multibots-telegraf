import { logger } from '@/utils/logger'
import { processBalanceOperation } from '@/price/helpers/processBalanceOperation'
import { refundUser } from '@/price/helpers/refundUser'
import { sendPhotoWithFallback } from '@/helpers/sendPhotoWithFallback'
import { MyContext } from '@/interfaces'
import { KieAiProvider } from './video-providers/KieAiProvider'
import axios from 'axios'

interface NanoBananaKieParams {
  telegram_id: string | number
  promptText: string
  inputImageUrl: string
  ctx: MyContext
  username?: string
  is_ru?: boolean
}

/**
 * Генерация изображения через Google Nano Banana на KIE.AI
 * ВАЖНО: KIE.AI работает только через callback механизм
 * Эта функция создает задачу и возвращает null
 * Результат должен прийти через webhook callback
 */
export async function generateNanoBananaKie({
  telegram_id,
  promptText,
  inputImageUrl,
  ctx,
  username,
  is_ru = true,
}: NanoBananaKieParams): Promise<string | null> {
  // Объявляем costPerImage до try для доступности в catch
  const costPerImage = 8 // Цена за одну генерацию на KIE.AI

  try {
    console.log('🚀 [generateNanoBananaKie] Starting generation via KIE.AI', {
      telegram_id,
      promptLength: promptText?.length,
      hasInputImage: !!inputImageUrl,
      username,
    })

    logger.info('[generateNanoBananaKie] Starting generation via KIE.AI', {
      telegram_id,
      promptLength: promptText.length,
      inputImageUrl,
      username,
    })

    // Проверяем баланс и списываем звезды
    console.log('🔵 [generateNanoBananaKie] Checking balance...', {
      telegram_id,
      costPerImage,
    })

    const balanceCheck = await processBalanceOperation({
      telegram_id:
        typeof telegram_id === 'string' ? parseInt(telegram_id) : telegram_id,
      paymentAmount: costPerImage,
      is_ru,
      bot_name: ctx.botInfo?.username,
      ctx,
    })

    console.log('🟢 [generateNanoBananaKie] Balance check result:', {
      telegram_id,
      balanceCheckSuccess: balanceCheck?.success,
      balanceCheckResult: balanceCheck,
    })

    if (!balanceCheck.success) {
      logger.warn('[generateNanoBananaKie] Insufficient balance', {
        telegram_id,
        required: costPerImage,
      })

      await ctx.reply(
        is_ru
          ? `❌ Недостаточно звезд для генерации\n\nТребуется: ${costPerImage}⭐\nВаш баланс: ${balanceCheck.currentBalance || 0}⭐\n\nПополните баланс через /start → 💎 Пополнить баланс`
          : `❌ Insufficient stars for generation\n\nRequired: ${costPerImage}⭐\nYour balance: ${balanceCheck.currentBalance || 0}⭐\n\nTop up via /start → 💎 Top up balance`
      )
      return null
    }

    console.log('💚 [generateNanoBananaKie] Balance check passed!', {
      telegram_id,
      balanceCheckSuccess: balanceCheck.success,
    })

    // Отправляем статус
    const statusMessage = await ctx.reply(
      is_ru
        ? '🎨 Генерирую ваш образ через Google Nano Banana (KIE.AI)...\n\n⏱ Это займет 10-20 секунд\n📐 Формат: 9:16 для Instagram Stories'
        : '🎨 Generating your image via Google Nano Banana (KIE.AI)...\n\n⏱ This will take 10-20 seconds\n📐 Format: 9:16 for Instagram Stories'
    )

    console.log('✅ [generateNanoBananaKie] Status message sent!', {
      telegram_id,
      messageId: statusMessage.message_id,
    })

    // Формируем callback URL для webhook с telegram_id (для прямой отправки)
    const callbackUrl = process.env.BASE_WEBHOOK_URL
      ? `${process.env.BASE_WEBHOOK_URL}/api/video-callback/${telegram_id}`
      : // BASE_WEBHOOK_URL в проде задана, эта ветка не берётся; мёртвый хост
        // в ней всё равно не нужен.
        undefined

    // Готовим запрос для KIE.AI
    const requestData = {
      model: 'google/nano-banana-edit',
      callBackUrl: callbackUrl,
      input: {
        prompt: promptText,
        image_urls: [inputImageUrl],
        output_format: 'png',
        image_size: '9:16', // Явно указываем формат 9:16
      },
    }

    logger.info('[generateNanoBananaKie] Calling KIE.AI API', {
      telegram_id,
      model: 'google/nano-banana-edit',
      prompt: promptText.substring(0, 100),
      imageSize: '9:16',
    })

    console.log('🎨 [generateNanoBananaKie] Calling KIE.AI API...', {
      telegram_id,
      model: 'google/nano-banana-edit',
      inputImageUrl: inputImageUrl.substring(0, 100) + '...',
      imageSize: '9:16',
    })

    // Вызываем KIE.AI API
    try {
      const response = await axios.post(
        'https://api.kie.ai/api/v1/jobs/createTask',
        requestData,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.KIE_AI_API_KEY}`,
          },
          timeout: 30000,
        }
      )

      console.log('🖼️ [generateNanoBananaKie] KIE.AI response received:', {
        telegram_id,
        responseStatus: response.status,
        responseData: response.data,
      })

      // Проверяем успешность ответа
      if (response.data.code !== 200) {
        throw new Error(response.data.msg || 'Failed to create task')
      }

      // Получаем taskId для отслеживания
      const taskId = response.data.data?.taskId
      if (!taskId) {
        throw new Error('No taskId returned from KIE.AI')
      }

      // KIE.AI работает через callback, поэтому просто ждем немного и возвращаем заглушку
      // В реальности результат придет на callback URL
      logger.info(
        '[generateNanoBananaKie] Task created, waiting for callback',
        {
          telegram_id,
          taskId,
          callbackUrl,
        }
      )

      // Временно возвращаем null, так как результат придет через callback
      // TODO: Реализовать webhook endpoint для приема callback от KIE.AI
      logger.warn(
        '[generateNanoBananaKie] KIE.AI requires callback mechanism, returning null',
        {
          telegram_id,
          taskId,
        }
      )

      // Удаляем сообщение о статусе, так как не будет мгновенной генерации
      try {
        await ctx.deleteMessage(statusMessage.message_id)
        await ctx.reply(
          is_ru
            ? '⚠️ Задача отправлена на генерацию. KIE.AI работает через callback, результат придет позже.'
            : '⚠️ Task sent for generation. KIE.AI works via callback, result will come later.'
        )
      } catch (err) {
        logger.warn('[generateNanoBananaKie] Failed to delete status message', {
          err,
        })
      }

      return null
    } catch (apiError) {
      console.error('🔴 [generateNanoBananaKie] API Error:', {
        telegram_id,
        errorMessage:
          apiError instanceof Error ? apiError.message : 'Unknown error',
        errorResponse: (apiError as any).response?.data,
      })
      throw apiError
    }
  } catch (error) {
    console.error('🔴 [generateNanoBananaKie] CRITICAL ERROR:', {
      telegram_id,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
      errorDetails: error,
    })

    logger.error('[generateNanoBananaKie] Generation failed', {
      telegram_id,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    // ✅ ВОЗВРАТ БАЛАНСА при ошибке генерации
    try {
      if (costPerImage > 0 && ctx) {
        await refundUser(ctx, costPerImage, {
          silent: true,
          reason: 'generation_failed',
        }) // silent refund
        logger.info('💰 Balance refunded after NanoBananaKie error', {
          telegram_id,
          refundAmount: costPerImage,
        })
      }
    } catch (refundError) {
      logger.error('Failed to refund after NanoBananaKie error', {
        telegram_id,
        refundError:
          refundError instanceof Error ? refundError.message : 'Unknown',
      })
    }

    // Отправляем сообщение администратору об ошибке
    try {
      const adminIds = process.env.ADMIN_IDS?.split(',') || []
      const adminMessage = `🚨 Ошибка в generateNanoBananaKie

👤 User: ${telegram_id} (@${username})
❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}
🎯 Prompt: ${promptText.substring(0, 100)}...

Проверьте логи для деталей.`

      for (const adminId of adminIds) {
        await ctx.telegram
          .sendMessage(adminId, adminMessage, {
            parse_mode: undefined, // ✅ Отключаем парсинг для технических сообщений с промптами
          })
          .catch(err => {
            // Only log errors that aren't "chat not found" (invalid admin IDs)
            if (!err.message?.includes('chat not found')) {
              console.error('Failed to notify admin:', err)
            }
          })
      }
    } catch (notifyError) {
      console.error('Failed to send admin notification:', notifyError)
    }

    await ctx.reply(
      is_ru
        ? '❌ Произошла ошибка при генерации. Попробуйте позже.'
        : '❌ An error occurred during generation. Please try later.'
    )

    return null
  }
}
