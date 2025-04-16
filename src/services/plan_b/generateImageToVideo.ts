import { replicate } from '@/core/replicate'

import { saveVideoUrlToSupabase } from '@/core/supabase'
import { downloadFile } from '@/helpers/downloadFile'


import { processBalanceVideoOperation } from '@/price/helpers'
import { getUserByTelegramId, updateUserLevelPlusOne } from '@/core/supabase'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { getBotByName } from '@/core/bot'
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'

interface ReplicateResponse {
  id: string
  output: string
}

type shortModelUrl = `${string}/${string}`

export const truncateText = (text: string, maxLength: number): string => {
  console.log(
    `✂️ Truncating text from ${text.length} to max ${maxLength} chars`
  )
  return text.length > maxLength
    ? text.substring(0, maxLength - 3) + '...'
    : text
}

export const generateImageToVideo = async (
  imageUrl: string,
  prompt: string,
  videoModel: string,
  telegram_id: string,
  username: string,
  is_ru: boolean,
  bot_name: string
): Promise<{ videoUrl?: string; prediction_id?: string } | string> => {
  try {
    console.log('Start generateImageToVideo', {
      imageUrl,
      prompt,
      videoModel,
      telegram_id,
      username,
      is_ru,
      bot_name,
    })
    if (!imageUrl) throw new Error('Image is required')
    if (!prompt) throw new Error('Prompt is required')
    if (!videoModel) throw new Error('Video model is required')
    if (!telegram_id) throw new Error('Telegram ID is required')
    if (!username) throw new Error('Username is required')
    if (!bot_name) throw new Error('Bot name is required')

    const userExists = await getUserByTelegramId(telegram_id)
    if (!userExists) {
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }
    const level = userExists.level
    if (level === 8) {
      await updateUserLevelPlusOne(telegram_id, level)
    }

    const { bot } = getBotByName(bot_name)

    // Создаём временный ctx для processBalanceVideoOperation
    const ctx = {
      from: { id: telegram_id },
      botInfo: { username: bot_name },
      telegram: bot?.telegram,
    } as any // MyContext
    const { newBalance, paymentAmount } = await processBalanceVideoOperation({
      videoModel,
      telegram_id,
      is_ru,
      ctx,
    })

    if (!bot) {
      throw new Error('Bot instance not found')
    }
    if (typeof newBalance !== 'number') {
      throw new Error('newBalance is undefined')
    }

    bot.telegram.sendMessage(
      telegram_id,
      is_ru ? '⏳ Генерация видео...' : '⏳ Generating video...',
      {
        reply_markup: {
          remove_keyboard: true,
        },
      }
    )

    const runModel = async (
      model: `${string}/${string}` | `${string}/${string}:${string}`,
      input: any
    ): Promise<ReplicateResponse> => {
      const result = (await replicate.run(model, {
        input,
      })) as ReplicateResponse

      return result
    }

    const imageBuffer = await downloadFile(imageUrl)
    const modelConfig = VIDEO_MODELS_CONFIG[videoModel]
    if (!modelConfig) {
      throw new Error(`🚫 Unsupported service: ${videoModel}`)
    }

    // 🎯 Формируем параметры для модели
    const modelInput = {
      ...modelConfig.api.input,
      prompt,
      aspect_ratio: userExists.aspectRatio,
      [(modelConfig.imageKey || 'image') as string]: imageBuffer, // 🖼 Динамический ключ для изображения
    }

    const result = await runModel(
      modelConfig.api.model as shortModelUrl,
      modelInput
    )

    // 🆕 Добавляем логирование параметров
    console.log('🎬 Video generation params:', {
      model: modelConfig.api.model,
      input: {
        ...modelInput,
        imageBuffer: imageBuffer?.length ? 'exists' : 'missing', // 🖼 Логируем наличие буфера
      },
      userAspectRatio: userExists.aspectRatio,
      modelConfig: modelConfig.api.input,
    })

    const videoUrl = result?.output ? result.output : result
    console.log('📹 Generated video URL:', videoUrl)

    //const videoUrl =
    ;('https://replicate.delivery/xezq/XatIg4rS2gaaN9TnENoqyKaw6JVfNH8AZ7Mm4CkSma4geuXUA/tmpygdbucj5.mp4')

    if (videoUrl) {
      const videoLocalPath = path.join(
        __dirname,
        '../uploads',
        telegram_id.toString(),
        'image-to-video',
        `${new Date().toISOString()}.mp4`
      )
      await mkdir(path.dirname(videoLocalPath), { recursive: true })

      // 1. Сохраняем оригинальное видео в Supabase
      const originalBuffer = await downloadFile(videoUrl as string)
      await writeFile(videoLocalPath, originalBuffer)
      await saveVideoUrlToSupabase(
        telegram_id,
        videoUrl as string,
        videoLocalPath,
        videoModel
      )

      await bot.telegram.sendVideo(telegram_id, { source: videoLocalPath })

      await bot.telegram.sendMessage(
        telegram_id,
        is_ru
          ? `Ваше видео сгенерировано!\n\nСгенерировать еще?\n\nСтоимость: ${paymentAmount.toFixed(
              2
            )} ⭐️\nВаш новый баланс: ${newBalance.toFixed(2)} ⭐️`
          : `Your video has been generated!\n\nGenerate more?\n\nCost: ${paymentAmount.toFixed(
              2
            )} ⭐️\nYour new balance: ${newBalance.toFixed(2)} ⭐️`,
        {
          reply_markup: {
            keyboard: [
              [
                {
                  text: is_ru
                    ? '🎥 Сгенерировать новое видео?'
                    : '🎥 Generate new video?',
                },
              ],
            ],
          },
        }
      )
      await bot.telegram.sendVideo(
        '@neuro_blogger_pulse',
        { source: videoLocalPath },
        {
          caption: (is_ru
            ? `${username} Telegram ID: ${telegram_id} сгенерировал видео с промптом: ${truncateText(
                prompt,
                900
              )}\n\nКоманда: ${videoModel}\n\nBot: @${bot.botInfo?.username}`
            : `${username} Telegram ID: ${telegram_id} generated a video with a prompt: ${truncateText(
                prompt,
                900
              )}\n\nCommand: ${videoModel}\n\nBot: @${bot.botInfo?.username}`
          ).slice(0, 1000),
        }
      )
    } else {
      throw new Error('Video URL is required')
    }

    return { videoUrl: videoUrl as string }
  } catch (error) {
    console.error('Error in generateImageToVideo:', error)
    const { bot } = getBotByName(bot_name)
    if (!bot) {
      throw new Error('Bot instance not found')
    }
    let errorMsg: string
    if (error instanceof Error) {
      errorMsg = error.message
    } else {
      errorMsg = String(error)
    }
    bot.telegram.sendMessage(
      telegram_id,
      is_ru
        ? `Произошла ошибка при генерации видео. Попробуйте еще раз.\n\nОшибка: ${errorMsg}`
        : `An error occurred during video generation. Please try again.\n\nError: ${errorMsg}`
    )
    // errorMessageAdmin(error as Error) // если функция не существует — удалить
    throw error
  }
}
