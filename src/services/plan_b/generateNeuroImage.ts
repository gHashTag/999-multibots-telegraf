import { replicate } from '@/core/replicate'
import { getAspectRatio } from '@/core/supabase/ai'
import { savePrompt } from '@/core/supabase/savePrompt'
import { getUserByTelegramId, updateUserLevelPlusOne } from '@/core/supabase'
import { processApiResponse } from '@/helpers/processApiResponse'
import { GenerationResult } from '@/interfaces'
import { downloadFile } from '@/helpers/downloadFile'
import { saveFileLocally } from '@/helpers'
import { pulse } from '@/helpers/pulse'
import { processBalanceOperation } from '@/price/helpers'
import { errorMessageAdmin } from '@/helpers'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { modeCosts } from '@/price/helpers/modelsCost'
import { ModeEnum } from '@/interfaces/modes'
import path from 'path'
import { API_URL } from '@/config'
import fs from 'fs'
import { TransactionType } from '@/interfaces/payments.interface'
export async function generateNeuroImage(
  prompt: string,
  model_url: `${string}/${string}` | `${string}/${string}:${string}`,
  num_images: number,
  telegram_id: string,
  username: string,
  is_ru: boolean,
  bot: Telegraf<MyContext>,
  bot_name: string
): Promise<GenerationResult | null> {
  try {
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
    if (typeof modeCosts[ModeEnum.NeuroPhoto] === 'function') {
      costPerImage = modeCosts[ModeEnum.NeuroPhoto](num_images)
    } else {
      costPerImage = modeCosts[ModeEnum.NeuroPhoto]
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
    const results: GenerationResult[] = []
    const input = {
      prompt: `Fashionable: ${prompt}. Cinematic Lighting, realistic, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. Masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details, high quality, gorgeous, glamorous, 8K, super detail, gorgeous light and shadow, detailed decoration, detailed lines.`,
      negative_prompt: 'nsfw, erotic, violence, bad anatomy...',
      num_inference_steps: 40,
      guidance_scale: 3,
      lora_scale: 1,
      megapixels: '1',
      output_quality: 80,
      prompt_strength: 0.8,
      extra_lora_scale: 1,
      go_fast: false,
      ...(aspect_ratio === '1:1'
        ? { width: 1024, height: 1024 }
        : aspect_ratio === '16:9'
        ? { width: 1368, height: 768 }
        : aspect_ratio === '9:16'
        ? { width: 768, height: 1368 }
        : { width: 1024, height: 1024 }),
      sampler: 'flowmatch',
      num_outputs: 1,
      aspect_ratio,
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

      const output = await replicate.run(model_url, { input })
      const imageUrl = await processApiResponse(output)

      if (!imageUrl || imageUrl.endsWith('empty.zip')) {
        console.error(`Failed to generate image ${i + 1}`)
        continue
      }

      // Сохраняем изображение на сервере
      const imageLocalPath = await saveFileLocally(
        telegram_id,
        imageUrl,
        'neuro-photo',
        '.jpeg'
      )

      // Генерируем URL для доступа к изображению
      const imageLocalUrl = `${API_URL}/uploads/${telegram_id}/neuro-photo/${path.basename(
        imageLocalPath
      )}`

      const prompt_id = await savePrompt(
        prompt,
        model_url,
        ModeEnum.NeuroPhoto,
        imageLocalUrl,
        telegram_id,
        'SUCCESS'
      )

      if (prompt_id === null) {
        console.error(`Failed to save prompt for image ${i + 1}`)
        continue
      }

      // Отправляем изображение пользователю
      await bot.telegram.sendPhoto(telegram_id, {
        source: fs.createReadStream(imageLocalPath),
      })

      // Сохраняем результат
      results.push({ image: imageLocalUrl, prompt_id })

      // Отправляем в pulse
      await pulse(
        imageLocalPath,
        prompt,
        `/${model_url}`,
        telegram_id,
        username,
        is_ru,
        bot_name
      )
    }

    await bot.telegram.sendMessage(
      telegram_id,
      is_ru
        ? `Ваши изображения сгенерированы!\n\nЕсли хотите сгенерировать еще, то выберите количество изображений в меню 1️⃣, 2️⃣, 3️⃣, 4️⃣.\n\nСтоимость: ${(
            costPerImage * num_images
          ).toFixed(
            2
          )} ⭐️\nВаш новый баланс: ${balanceCheck.newBalance?.toFixed(2) || 0} ⭐️`
        : `Your images have been generated!\n\nGenerate more?\n\nCost: ${(
            costPerImage * num_images
          ).toFixed(
            2
          )} ⭐️\nYour new balance: ${balanceCheck.newBalance?.toFixed(2) || 0} ⭐️`,
      {
        reply_markup: {
          keyboard: [
            [{ text: '1️⃣' }, { text: '2️⃣' }, { text: '3️⃣' }, { text: '4️⃣' }],
            [
              { text: is_ru ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt' },
              { text: is_ru ? '📐 Изменить размер' : '📐 Change size' },
            ],
            [{ text: is_ru ? '🏠 Главное меню' : '🏠 Main menu' }],
          ],
          resize_keyboard: true,
          one_time_keyboard: false,
        },
      }
    )

    return results[0] || null
  } catch (error: any) {
    console.error(`Error:`, error)

    let errorMessageToUser = '❌ Произошла ошибка.'

    if (error.message && error.message.includes('NSFW content detected')) {
      errorMessageToUser = is_ru
        ? '❌ Обнаружен NSFW контент. Пожалуйста, попробуйте другой запрос.'
        : '❌ NSFW content detected. Please try another prompt.'
    } else if (error.message) {
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
    await bot.telegram.sendMessage(telegram_id, errorMessageToUser)
    errorMessageAdmin(error as Error)
    throw error
  }
}
