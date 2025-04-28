import { replicate } from '@/core/replicate'
import { pulse } from '@/helpers'
import { mkdir, writeFile } from 'fs/promises'

import {
  getUserByTelegramIdString,
  saveVideoUrlToSupabase,
  getUserBalance,
} from '@/core/supabase'
import path from 'path'
import { getBotByName } from '@/core/bot'
import { updateUserLevelPlusOne } from '@/core/supabase'
import { VIDEO_MODELS_CONFIG } from '@/pricing/config/models.config'
import {
  sendServiceErrorToUser,
  sendServiceErrorToAdmin,
} from '@/helpers/error'
import { toBotName } from '@/helpers/botName.helper'
import { logger } from '@/utils/logger'
import { updateUserStarsBalance } from '@/core/supabase/balance/updateUserStarsBalance'
import { calculateFinalStarPrice } from '@/pricing/calculator'
import { ModeEnum } from '@/interfaces/modes'

import { generateVideo } from '@/core/replicate/generateVideo'
import { Markup } from 'telegraf'

// Определяем тип локально
type VideoModelConfigKey = keyof typeof VIDEO_MODELS_CONFIG

export const processVideoGeneration = async (
  videoModel: VideoModelConfigKey,
  aspect_ratio: string,
  prompt: string
) => {
  const modelConfig = VIDEO_MODELS_CONFIG[videoModel]

  if (!modelConfig) {
    throw new Error('Invalid video model')
  }

  const output = await replicate.run(
    modelConfig.api.model as `${string}/${string}`,
    {
      input: {
        prompt,
        ...modelConfig.api.input,
        aspect_ratio,
      },
    }
  )

  return output
}

export const generateTextToVideo = async (
  prompt: string,
  videoModel: VideoModelConfigKey,
  telegram_id: string,
  username: string,
  is_ru: boolean,
  bot_name: string
): Promise<{ videoLocalPath: string }> => {
  const validBotName = toBotName(bot_name)
  const botData = await getBotByName(validBotName)
  if (!botData || !botData.bot) {
    logger.error(`Bot instance not found for name: ${validBotName}`)
    throw new Error('Bot instance not found')
  }
  const { bot } = botData
  const telegram_id_str = telegram_id.toString()

  try {
    logger.info('videoModel', videoModel)
    if (!prompt) throw new Error('Prompt is required')
    if (!videoModel) throw new Error('Video model is required')
    if (!telegram_id) throw new Error('Telegram ID is required')
    if (!username) throw new Error('Username is required')
    if (!bot_name) throw new Error('Bot name is required')

    const userExists = await getUserByTelegramIdString(telegram_id_str)
    if (!userExists) {
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }
    const level = userExists.level
    if (level === 9) {
      await updateUserLevelPlusOne(telegram_id, level)
    }

    logger.info('💰 Проверка и списание баланса для TextToVideo', {
      telegram_id: telegram_id_str,
      videoModel,
    })

    const costResult = calculateFinalStarPrice(ModeEnum.TextToVideo, {
      modelId: videoModel,
    })
    if (!costResult) {
      logger.error('❌ Ошибка расчета стоимости TextToVideo', {
        telegram_id: telegram_id_str,
        videoModel,
      })
      throw new Error('Failed to calculate cost for TextToVideo')
    }
    const paymentAmount = costResult.stars

    const currentBalance = await getUserBalance(telegram_id_str, validBotName)

    if (currentBalance < paymentAmount) {
      logger.warn('📉 Недостаточно средств для TextToVideo', {
        telegram_id: telegram_id_str,
        currentBalance,
        paymentAmount,
      })
      const errorMsg = is_ru
        ? `Недостаточно звезд (нужно ${paymentAmount}⭐️, у вас ${currentBalance}⭐️). Пополните баланс.`
        : `Insufficient stars (required ${paymentAmount}⭐️, you have ${currentBalance}⭐️). Top up balance.`
      try {
        await bot.telegram.sendMessage(telegram_id_str, errorMsg)
      } catch (e) {
        logger.error('Error sending insufficient balance message', e)
      }
      throw new Error(errorMsg)
    }

    const expenseAmount = -paymentAmount
    const updateSuccess = await updateUserStarsBalance(
      telegram_id_str,
      expenseAmount
    )
    if (!updateSuccess) {
      logger.error('❌ Ошибка списания звезд для TextToVideo', {
        telegram_id: telegram_id_str,
        amount: expenseAmount,
      })
      throw new Error('Failed to update stars balance')
    }

    const newBalance = currentBalance + expenseAmount

    logger.info('✅ Баланс успешно списан для TextToVideo', {
      telegram_id: telegram_id_str,
      oldBalance: currentBalance,
      newBalance,
      cost: paymentAmount,
    })

    await bot.telegram.sendMessage(
      telegram_id_str,
      is_ru ? '⏳ Генерация видео...' : '⏳ Generating video...',
      {
        reply_markup: {
          remove_keyboard: true,
        },
      }
    )

    const modelConfig = VIDEO_MODELS_CONFIG[videoModel]
    if (!modelConfig) {
      throw new Error(
        `Invalid video model configuration for: ${String(videoModel)}`
      )
    }

    const videoBuffer = await generateVideo(
      prompt,
      modelConfig.api.model,
      modelConfig.api.input.negative_prompt || ''
    )

    let videoUrl: string
    if (Array.isArray(videoBuffer)) {
      if (!videoBuffer[0]) {
        throw new Error('Empty array or first element is undefined')
      }
      videoUrl = videoBuffer[0]
    } else if (typeof videoBuffer === 'string') {
      videoUrl = videoBuffer
    } else {
      console.error(
        'Unexpected output format:',
        JSON.stringify(videoBuffer, null, 2)
      )
      throw new Error(
        `Unexpected output format from API: ${typeof videoBuffer}`
      )
    }
    const videoLocalPath = path.join(
      __dirname,
      '../uploads',
      telegram_id.toString(),
      'text-to-video',
      `${new Date().toISOString()}.mp4`
    )
    console.log(videoLocalPath, 'videoLocalPath')
    await mkdir(path.dirname(videoLocalPath), { recursive: true })

    await writeFile(videoLocalPath, videoBuffer)

    await saveVideoUrlToSupabase(
      telegram_id,
      videoUrl as string,
      videoLocalPath,
      videoModel
    )

    await bot.telegram.sendVideo(telegram_id_str, {
      source: videoLocalPath,
    })

    await bot.telegram.sendMessage(
      telegram_id_str,
      is_ru
        ? `Ваше видео сгенерировано!\n\nСгенерировать еще?\n\nСписано: ${paymentAmount} ⭐️\nВаш новый баланс: ${newBalance} ⭐️`
        : `Your video has been generated!\n\nGenerate more?\n\nCost: ${paymentAmount} ⭐️\nYour new balance: ${newBalance} ⭐️`,
      Markup.keyboard([
        [
          Markup.button.text(
            is_ru ? '🎥 Сгенерировать новое видео?' : '🎥 Generate new video?'
          ),
        ],
      ]).resize(false)
    )

    await pulse(
      videoLocalPath,
      prompt,
      'text-to-video',
      telegram_id,
      username,
      is_ru,
      validBotName
    )

    return { videoLocalPath }
  } catch (error) {
    logger.error('Error in generateTextToVideo:', error)
    await sendServiceErrorToUser(bot, telegram_id, error as Error, is_ru)
    await sendServiceErrorToAdmin(bot, telegram_id, error as Error)

    if (error instanceof Error) {
      console.error('Error name:', error.name)
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }
    throw error
  }
}
