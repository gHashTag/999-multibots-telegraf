import { logger } from '@/utils/logger'
import { processBalanceOperation } from '@/price/helpers/processBalanceOperation'
import { sendPhotoWithFallback } from '@/helpers/sendPhotoWithFallback'
import { MyContext } from '@/interfaces'
import Replicate from 'replicate'

interface NanoBananaParams {
  telegram_id: string | number
  promptText: string
  inputImageUrl: string
  ctx: MyContext
  username?: string
  is_ru?: boolean
}

/**
 * Генерация изображения через Google Nano Banana (Replicate)
 * Трансформирует входное изображение в стиле персонажа
 */
export async function generateNanoBanana({
  telegram_id,
  promptText,
  inputImageUrl,
  ctx,
  username,
  is_ru = true,
}: NanoBananaParams): Promise<string | null> {
  try {
    console.log('🚀🚀🚀 [generateNanoBanana] FUNCTION CALLED! 🚀🚀🚀', {
      telegram_id,
      promptLength: promptText?.length,
      hasInputImage: !!inputImageUrl,
      username,
    })
    
    logger.info('[generateNanoBanana] Starting generation', {
      telegram_id,
      promptLength: promptText.length,
      inputImageUrl,
      username,
    })

    // Цена за одну генерацию (как было для FLUX Kontext Max)
    const costPerImage = 12

    // Проверяем баланс и списываем звезды
    console.log('🔵🔵🔵 [generateNanoBanana] Calling processBalanceOperation...', {
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
    
    console.log('🟢🟢🟢 [generateNanoBanana] Balance check result:', {
      telegram_id,
      balanceCheckSuccess: balanceCheck?.success,
      balanceCheckResult: balanceCheck,
    })

    if (!balanceCheck.success) {
      logger.warn('[generateNanoBanana] Insufficient balance', {
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

    console.log('💚💚💚 [generateNanoBanana] Balance check passed! Continuing...', {
      telegram_id,
      balanceCheckSuccess: balanceCheck.success,
      ctxExists: !!ctx,
      ctxReplyExists: !!ctx?.reply,
    })

    // Проверка контекста
    if (!ctx || !ctx.reply) {
      console.error('❌❌❌ [generateNanoBanana] Context lost after balance check!', {
        telegram_id,
        ctxExists: !!ctx,
        ctxReplyExists: !!ctx?.reply,
      })
      throw new Error('Context lost after balance check')
    }

    // Отправляем статус
    console.log('📤📤📤 [generateNanoBanana] Sending status message...', { telegram_id })
    
    const statusMessage = await ctx.reply(
      is_ru
        ? '🎨 Генерирую ваш образ через Google Nano Banana...\n\n⏱ Это займет 10-20 секунд'
        : '🎨 Generating your image via Google Nano Banana...\n\n⏱ This will take 10-20 seconds'
    )
    
    console.log('✅✅✅ [generateNanoBanana] Status message sent!', { 
      telegram_id,
      messageId: statusMessage.message_id,
    })

    // Инициализируем Replicate
    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    })

    logger.info('[generateNanoBanana] Calling Replicate API', {
      telegram_id,
      model: 'google/nano-banana',
      prompt: promptText.substring(0, 100),
    })

    // Вызываем модель Nano Banana
    // Модель принимает массив изображений, но мы используем одно
    console.log('🎨🎨🎨 [generateNanoBanana] Calling Replicate.run...', {
      telegram_id,
      model: 'google/nano-banana',
      inputImageUrl: inputImageUrl.substring(0, 100) + '...',
    })
    
    // Добавляем указание на формат 9:16 в промпт
    const enhancedPrompt = `${promptText} The image must be in 9:16 vertical portrait format for Instagram stories.`
    
    const output = await replicate.run(
      "google/nano-banana",
      {
        input: {
          prompt: enhancedPrompt,
          image_input: [inputImageUrl]
        }
      }
    )
    
    console.log('🖼️🖼️🖼️ [generateNanoBanana] Replicate output received:', {
      telegram_id,
      outputType: typeof output,
      isArray: Array.isArray(output),
      outputValue: output,
      outputStringified: JSON.stringify(output).substring(0, 500),
    })

    // Получаем URL результата
    let imageUrl: string | null = null
    
    if (output && typeof output === 'object' && 'url' in output) {
      // Если output имеет метод url()
      imageUrl = (output as any).url?.() || null
      console.log('📍 Case 1: output.url() =', imageUrl)
    } else if (typeof output === 'string') {
      // Если output - это строка с URL
      imageUrl = output
      console.log('📍 Case 2: string output =', imageUrl)
    } else if (Array.isArray(output) && output.length > 0) {
      // Если output - массив URL
      imageUrl = output[0]
      console.log('📍 Case 3: array[0] =', imageUrl)
    } else if (output && typeof output === 'object') {
      // Проверяем другие возможные структуры
      console.log('📍 Case 4: Checking object structure...')
      // Может быть output.output или output.prediction
      imageUrl = (output as any).output || (output as any).prediction || null
      console.log('📍 Case 4: extracted =', imageUrl)
    }

    if (!imageUrl) {
      console.error('❌❌❌ [generateNanoBanana] No image URL found in response!', {
        telegram_id,
        output,
        outputKeys: output ? Object.keys(output) : null,
      })
      throw new Error('No image URL in Nano Banana response')
    }

    console.log('✨✨✨ [generateNanoBanana] IMAGE URL FOUND!', {
      telegram_id,
      imageUrl,
    })
    
    logger.info('[generateNanoBanana] Image generated successfully', {
      telegram_id,
      imageUrl: imageUrl.substring(0, 50) + '...',
    })

    // Удаляем сообщение о статусе
    try {
      await ctx.deleteMessage(statusMessage.message_id)
    } catch (err) {
      logger.warn('[generateNanoBanana] Failed to delete status message', { err })
    }

    console.log('📮📮📮 [generateNanoBanana] Preparing to send photo...', {
      telegram_id,
      imageUrl,
    })

    // Отправляем изображение пользователю с рекламой бота
    const botUsername = ctx.botInfo?.username || 'clip_maker_neuro_bot'
    const caption = is_ru
      ? `✨ Ваш образ готов!\n\n🎨 Создано с помощью Google Nano Banana\n💫 Потрачено: ${costPerImage}⭐\n\nСоздайте еще образы через /start\n\n🤖 Сделано в боте @${botUsername}`
      : `✨ Your image is ready!\n\n🎨 Created with Google Nano Banana\n💫 Spent: ${costPerImage}⭐\n\nCreate more images via /start\n\n🤖 Made with @${botUsername} bot`

    console.log('🚀 [generateNanoBanana] About to call sendPhotoWithFallback', {
      telegram_id,
      imageUrl,
      captionLength: caption.length,
      ctxExists: !!ctx,
      ctxReplyWithPhotoExists: !!ctx?.replyWithPhoto,
    })

    const sendResult = await sendPhotoWithFallback(ctx, imageUrl, {
      caption
    })
    
    console.log('🎯 [generateNanoBanana] sendPhotoWithFallback result:', {
      telegram_id,
      sendResult,
      imageUrl,
    })
    
    if (!sendResult) {
      console.error('❌ [generateNanoBanana] Failed to send photo!', {
        telegram_id,
        imageUrl,
      })
      throw new Error('Failed to send photo to user')
    }
    
    console.log('📬📬📬 [generateNanoBanana] Photo sent successfully!', {
      telegram_id,
      imageUrl,
    })

    return imageUrl
  } catch (error) {
    console.error('🔴🔴🔴 [generateNanoBanana] CRITICAL ERROR:', {
      telegram_id,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
      errorDetails: error,
    })
    
    logger.error('[generateNanoBanana] Generation failed', {
      telegram_id,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    // Отправляем сообщение администратору об ошибке
    try {
      const adminIds = process.env.ADMIN_IDS?.split(',') || []
      const adminMessage = `🚨 Ошибка в generateNanoBanana

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
        ? '❌ Произошла ошибка при генерации\\. Попробуйте позже\\.'
        : '❌ An error occurred during generation\\. Please try later\\.',
      { parse_mode: 'MarkdownV2' }
    )

    return null
  }
}