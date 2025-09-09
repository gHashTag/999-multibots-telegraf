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
        ? '🎨 Генерирую ваш образ через Google Nano Banana\\.\\.\\.\\n⏱ Это займет 10\\-20 секунд'
        : '🎨 Generating your image via Google Nano Banana\\.\\.\\.\\n⏱ This will take 10\\-20 seconds',
      { parse_mode: 'MarkdownV2' }
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
    const output = await replicate.run(
      "google/nano-banana",
      {
        input: {
          prompt: promptText,
          image_input: [inputImageUrl]
        }
      }
    )

    // Получаем URL результата
    let imageUrl: string | null = null
    
    if (output && typeof output === 'object' && 'url' in output) {
      // Если output имеет метод url()
      imageUrl = (output as any).url?.() || null
    } else if (typeof output === 'string') {
      // Если output - это строка с URL
      imageUrl = output
    } else if (Array.isArray(output) && output.length > 0) {
      // Если output - массив URL
      imageUrl = output[0]
    }

    if (!imageUrl) {
      throw new Error('No image URL in Nano Banana response')
    }

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

    // Отправляем изображение пользователю
    const caption = is_ru
      ? `✨ *Ваш образ готов!*\\n\\n🎨 Создано с помощью Google Nano Banana\\n💫 Потрачено: ${costPerImage}⭐\\n\\n_Создайте еще образы через_ /start`
      : `✨ *Your image is ready!*\\n\\n🎨 Created with Google Nano Banana\\n💫 Spent: ${costPerImage}⭐\\n\\n_Create more images via_ /start`

    await sendPhotoWithFallback(ctx, imageUrl, {
      caption,
      parse_mode: 'MarkdownV2'
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
      const adminMessage = `🚨 *Ошибка в generateNanoBanana*

👤 User: ${telegram_id} (@${username})
❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}
🎯 Prompt: ${promptText.substring(0, 100)}...

Проверьте логи для деталей.`

      for (const adminId of adminIds) {
        await ctx.telegram.sendMessage(adminId, adminMessage, {
          parse_mode: 'Markdown'
        }).catch(err => console.error('Failed to notify admin:', err))
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