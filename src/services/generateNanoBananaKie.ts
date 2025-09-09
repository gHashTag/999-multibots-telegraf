import { logger } from '@/utils/logger'
import { processBalanceOperation } from '@/price/helpers/processBalanceOperation'
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
 * Поддерживает формат 9:16 для Instagram Stories
 */
export async function generateNanoBananaKie({
  telegram_id,
  promptText,
  inputImageUrl,
  ctx,
  username,
  is_ru = true,
}: NanoBananaKieParams): Promise<string | null> {
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

    // Цена за одну генерацию на KIE.AI (дешевле чем Replicate)
    const costPerImage = 8 // Уменьшаем цену, так как KIE.AI дешевле

    // Проверяем баланс и списываем звезды
    console.log('🔵 [generateNanoBananaKie] Checking balance...', {
      telegram_id,
      costPerImage,
    })
    
    const balanceCheck = await processBalanceOperation({
      telegram_id: typeof telegram_id === 'string' ? parseInt(telegram_id) : telegram_id,
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

    // Формируем callback URL для webhook
    const callbackUrl = process.env.BASE_WEBHOOK_URL
      ? `${process.env.BASE_WEBHOOK_URL}/api/kie-ai/nano-banana/callback`
      : 'https://ai-server-production-production-8e2d.up.railway.app/api/kie-ai/nano-banana/callback'

    // Готовим запрос для KIE.AI
    const requestData = {
      model: 'google/nano-banana-edit',
      callBackUrl: callbackUrl,
      input: {
        prompt: promptText,
        image_urls: [inputImageUrl],
        output_format: 'png',
        image_size: '9:16' // Явно указываем формат 9:16
      }
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
            'Authorization': `Bearer ${process.env.KIE_AI_API_KEY}`,
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

      // Polling для получения результата
      let imageUrl: string | null = null
      let attempts = 0
      const maxAttempts = 30 // 30 попыток по 2 секунды = 60 секунд максимум

      while (attempts < maxAttempts) {
        attempts++
        
        // Ждем 2 секунды между проверками
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Проверяем статус задачи - используем GET с query параметром
        const statusResponse = await axios.get(
          `https://api.kie.ai/jobs/taskResult`,
          {
            params: { taskId }, // Передаем taskId как query параметр
            headers: {
              'Authorization': `Bearer ${process.env.KIE_AI_API_KEY}`,
            },
            timeout: 10000,
          }
        )

        console.log(`🔄 [generateNanoBananaKie] Checking status (attempt ${attempts}/${maxAttempts}):`, {
          telegram_id,
          taskId,
          response: statusResponse.data,
        })

        // Обрабатываем ответ от KIE.AI
        const responseData = statusResponse.data
        
        console.log(`🔍 [generateNanoBananaKie] Response structure:`, {
          hasStatus: !!responseData.status,
          hasImages: !!responseData.images,
          hasData: !!responseData.data,
          status: responseData.status,
        })
        
        // Проверяем статус задачи
        if (responseData.status === 'success' || responseData.status === 'completed') {
          // Ищем URL изображения в разных местах
          if (responseData.images && Array.isArray(responseData.images) && responseData.images.length > 0) {
            imageUrl = responseData.images[0]
          } else if (responseData.data?.images && Array.isArray(responseData.data.images)) {
            imageUrl = responseData.data.images[0]
          } else if (responseData.resultUrl) {
            imageUrl = responseData.resultUrl
          } else if (responseData.data?.resultUrl) {
            imageUrl = responseData.data.resultUrl
          }
          
          if (imageUrl) {
            console.log('✨ [generateNanoBananaKie] Image generated successfully!', {
              telegram_id,
              imageUrl,
            })
            break
          }
        } else if (responseData.status === 'processing' || responseData.status === 'pending' || responseData.status === 'queued') {
          // Задача еще выполняется
          console.log('⏳ [generateNanoBananaKie] Task still processing...', {
            status: responseData.status,
            attempt: attempts,
          })
        } else if (responseData.status === 'failed' || responseData.status === 'error') {
          throw new Error(`Task failed: ${responseData.message || responseData.error || 'Unknown error'}`)
        } else {
          // Неизвестный статус - продолжаем ждать
          console.log('❓ [generateNanoBananaKie] Unknown status, continuing...', {
            status: responseData.status,
            response: responseData,
          })
        }
      }

      if (!imageUrl) {
        throw new Error('Timeout waiting for image generation')
      }

      logger.info('[generateNanoBananaKie] Image generated successfully', {
        telegram_id,
        imageUrl: imageUrl.substring(0, 50) + '...',
        taskId,
      })

      // Удаляем сообщение о статусе
      try {
        await ctx.deleteMessage(statusMessage.message_id)
      } catch (err) {
        logger.warn('[generateNanoBananaKie] Failed to delete status message', { err })
      }

      // Отправляем изображение пользователю с рекламой бота
      const botUsername = ctx.botInfo?.username || 'clip_maker_neuro_bot'
      const caption = is_ru
        ? `✨ Ваш образ готов!\n\n🎨 Создано с помощью Google Nano Banana (KIE.AI)\n📐 Формат: 9:16 для Instagram Stories\n💫 Потрачено: ${costPerImage}⭐\n\nСоздайте еще образы через /start\n\n🤖 Сделано в боте @${botUsername}`
        : `✨ Your image is ready!\n\n🎨 Created with Google Nano Banana (KIE.AI)\n📐 Format: 9:16 for Instagram Stories\n💫 Spent: ${costPerImage}⭐\n\nCreate more images via /start\n\n🤖 Made with @${botUsername} bot`

      console.log('📮 [generateNanoBananaKie] Sending photo to user...', {
        telegram_id,
        imageUrl,
      })

      await sendPhotoWithFallback(ctx, imageUrl, {
        caption
      })
      
      console.log('📬 [generateNanoBananaKie] Photo sent successfully!', {
        telegram_id,
        imageUrl,
      })

      return imageUrl

    } catch (apiError) {
      console.error('🔴 [generateNanoBananaKie] API Error:', {
        telegram_id,
        errorMessage: apiError instanceof Error ? apiError.message : 'Unknown error',
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

    // Отправляем сообщение администратору об ошибке
    try {
      const adminIds = process.env.ADMIN_IDS?.split(',') || []
      const adminMessage = `🚨 Ошибка в generateNanoBananaKie

👤 User: ${telegram_id} (@${username})
❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}
🎯 Prompt: ${promptText.substring(0, 100)}...

Проверьте логи для деталей.`

      for (const adminId of adminIds) {
        await ctx.telegram.sendMessage(adminId, adminMessage).catch(err => console.error('Failed to notify admin:', err))
      }
    } catch (notifyError) {
      console.error('Failed to send admin notification:', notifyError)
    }

    await ctx.reply(
      is_ru
        ? '❌ Произошла ошибка при генерации. Попробуйте позже.'
        : '❌ An error occurred during generation. Please try later.',
    )

    return null
  }
}