import { getAspectRatio, saveNeuroPhotoPrompt } from '@/core/supabase'
import {
  getUserByTelegramId,
  updateUserLevelPlusOne,
  getFineTuneIdByTelegramId,
} from '@/core/supabase'
import { API_URL } from '@/config'
import { GenerationResult } from '@/interfaces'
import { TransactionType } from '@/interfaces/payments.interface'
import { processBalanceOperation } from '@/price/helpers'
import { errorMessageAdmin } from '@/helpers/'

import { modeCosts,  } from '@/price/helpers/modelsCost'
import { getBotByName } from '@/core/bot'
import { MyContext } from '@/interfaces'
import { Telegraf } from 'telegraf'
import { ModeEnum } from '@/interfaces/modes'

export async function generateNeuroImageV2(
  prompt: string,
  num_images: number,
  telegram_id: string,
  is_ru: boolean,
  bot_name: string
): Promise<GenerationResult | null> {
  let bot: Telegraf<MyContext>
  try {
    console.log('telegram_id', telegram_id)
    console.log('is_ru', is_ru)
    console.log('bot_name', bot_name)
    console.log('prompt', prompt)
    console.log('num_images', num_images)

    const botInstance = getBotByName(bot_name).bot
    if (!botInstance) {
      throw new Error(`Bot with name ${bot_name} does not exist.`)
    }
    bot = botInstance

    const userExists = await getUserByTelegramId(telegram_id)

    if (!userExists) {
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }
    const level = userExists.level
    if (level === 1) {
      await updateUserLevelPlusOne(telegram_id, level)
    }
    // Проверка баланса для всех изображений
    let costPerImage: number
    if (typeof modeCosts[ModeEnum.NeuroPhotoV2] === 'function') {
      costPerImage = modeCosts[ModeEnum.NeuroPhotoV2](num_images)
    } else {
      costPerImage = modeCosts[ModeEnum.NeuroPhotoV2]
    }

    const balanceCheck = await processBalanceOperation({
      telegram_id,
      amount: costPerImage * num_images,
      is_ru,
      bot,
      bot_name,
      description: `Payment for generating ${num_images} image${
        num_images === 1 ? '' : 's'
      } with prompt: ${prompt.substring(0, 30)}...`,
      type: TransactionType.MONEY_EXPENSE,
    })
    if (!balanceCheck.success) {
      throw new Error(balanceCheck.error)
    }

    const aspect_ratio = await getAspectRatio(telegram_id)

    const finetune_id = await getFineTuneIdByTelegramId(telegram_id)
    console.log('finetuneId', finetune_id)

    const input = {
      finetune_id,
      finetune_strength: 2,
      prompt: `Fashionable: ${prompt}. Cinematic Lighting, realistic, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. Masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details, high quality, gorgeous, glamorous, 8K, super detail, gorgeous light and shadow, detailed decoration, detailed lines.`,
      aspect_ratio,
      ...(aspect_ratio === '1:1'
        ? { width: 1024, height: 1024 }
        : aspect_ratio === '16:9'
        ? { width: 1368, height: 768 }
        : aspect_ratio === '9:16'
        ? { width: 768, height: 1368 }
        : { width: 1024, height: 1024 }),
      safety_tolerance: 0,
      output_format: 'jpeg',
      prompt_upsampling: true,
      webhook_url: `${API_URL}/webhooks/webhook-bfl-neurophoto`,
      webhook_secret: process.env.BFL_WEBHOOK_SECRET as string,
    }

    // Цикл генерации изображений
    for (let i = 0; i < num_images; i++) {
      if (num_images > 1) {
        bot.telegram.sendMessage(
          telegram_id,
          is_ru
            ? `⏳ Генерация изображения ${i + 1} из ${num_images}`
            : `⏳ Generating image ${i + 1} of ${num_images}`
        )
      } else {
        bot.telegram.sendMessage(
          telegram_id,
          is_ru ? '⏳ Генерация...' : '⏳ Generating...',
          {
            reply_markup: { remove_keyboard: true },
          }
        )
      }
      //flux-pro-finetuned
      //flux-pro-1.1-ultra-finetuned

      const response = await fetch(
        'https://api.us1.bfl.ai/v1/flux-pro-1.1-ultra-finetuned',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Key': process.env.BFL_API_KEY as string,
          },
          body: JSON.stringify(input),
        }
      )

      const data: any = await response.json()
      console.log('response V2 data:', data)

      await saveNeuroPhotoPrompt(
        data.id as string,
        prompt,
        ModeEnum.NeuroPhotoV2,
        telegram_id,
        'success'
      )
    }
    return null
  } catch (error) {
    console.error(`Error:`, error)

    let errorMessageToUser = '❌ Произошла ошибка.'

    if (error instanceof Error && error.message && error.message.includes('NSFW content detected')) {
      errorMessageToUser = is_ru
        ? '❌ Обнаружен NSFW контент. Пожалуйста, попробуйте другой запрос.'
        : '❌ NSFW content detected. Please try another prompt.'
    } else if (error instanceof Error && error.message) {
      const match = error.message.match(/{"detail":"(.*?)"/)
      if (match && match[1]) {
        errorMessageToUser = is_ru
          ? `❌ Ошибка: ${match[1]}`
          : `❌ Error: ${match[1]}`
      }
    } else {
      errorMessageToUser = is_ru
        ? '❌ Произошла ошибка. Попробуйте еще раз.'
        : '❌ An error occurred. Please try again.'
    }

    const bot = getBotByName(bot_name).bot
    if (!bot) {
      throw new Error(`Bot with name ${bot_name} does not exist.`)
    }

    // Отправляем сообщение об ошибке пользователю
    await bot.telegram.sendMessage(telegram_id, errorMessageToUser)

    // Логируем ошибку для администратора
    errorMessageAdmin(error as Error)

    throw error
  }
}
