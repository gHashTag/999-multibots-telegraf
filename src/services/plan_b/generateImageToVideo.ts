import { replicate } from '@/core/replicate'

import {
  getUserByTelegramIdString,
  saveVideoUrlToSupabase,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { downloadFile } from '@/helpers/downloadFile'

import { processBalanceVideoOperation } from '@/price/helpers'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { getBotByName } from '@/core/bot'
import {
  sendServiceErrorToUser,
  sendServiceErrorToAdmin,
} from '@/helpers/error'
import { VIDEO_MODELS_CONFIG } from '@/price/models/VIDEO_MODELS_CONFIG'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { Markup } from 'telegraf'
import { toBotName } from '@/helpers/botName.helper'
import { pulse } from '@/helpers/pulse'

interface ReplicateResponse {
  id?: string
  output: string | string[]
}

type VideoModelConfigKey = keyof typeof VIDEO_MODELS_CONFIG

export const truncateText = (text: string, maxLength: number): string => {
  logger.info(
    `✂️ Truncating text from ${text.length} to max ${maxLength} chars`
  )
  return text.length > maxLength
    ? text.substring(0, maxLength - 3) + '...'
    : text
}

export const generateImageToVideo = async (
  ctx: MyContext,
  imageUrl: string | null,
  prompt: string | null,
  videoModel: VideoModelConfigKey,
  telegram_id: string,
  username: string,
  is_ru: boolean,
  bot_name: string,
  is_morphing = false,
  imageAUrl: string | null = null,
  imageBUrl: string | null = null
): Promise<{ videoLocalPath?: string } | null> => {
  const validBotName = toBotName(bot_name)
  const botData = await getBotByName(validBotName)
  if (!botData || !botData.bot) {
    logger.error(`Bot instance not found for name: ${validBotName}`)
    throw new Error('Bot instance not found')
  }
  const { bot } = botData

  try {
    logger.info('Plan B: Start generateImageToVideo', {
      imageUrl: imageUrl ? 'present' : 'absent',
      prompt: prompt ? 'present' : 'absent',
      videoModel,
      telegram_id,
      username,
      is_ru,
      bot_name: validBotName,
      is_morphing,
      imageAUrl: imageAUrl ? 'present' : 'absent',
      imageBUrl: imageBUrl ? 'present' : 'absent',
    })

    const modelConfig = VIDEO_MODELS_CONFIG[videoModel]
    if (!modelConfig) {
      throw new Error(`Конфигурация для модели ${videoModel} не найдена.`)
    }

    if (is_morphing) {
      if (!imageAUrl || !imageBUrl) {
        throw new Error('imageAUrl и imageBUrl обязательны для морфинга')
      }
    } else {
      if (!imageUrl) {
        throw new Error('imageUrl обязателен для стандартного режима')
      }
      if (!prompt) {
        throw new Error('prompt обязателен для стандартного режима')
      }
    }
    if (!videoModel || !telegram_id || !username || !validBotName) {
      throw new Error('Отсутствуют общие обязательные параметры')
    }
    if (is_morphing && !modelConfig.canMorph) {
      throw new Error(
        is_ru
          ? `Модель ${modelConfig.title} не поддерживает режим морфинга.`
          : `Model ${modelConfig.title} does not support morphing mode.`
      )
    }

    const userExists = await getUserByTelegramIdString(telegram_id)
    if (!userExists) {
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }
    const level = userExists.level
    if (level === 8) {
      await updateUserLevelPlusOne(telegram_id, level)
    }

    const tempCtxForBalance =
      ctx ||
      ({
        from: { id: Number(telegram_id) },
        botInfo: { username: validBotName },
        telegram: bot.telegram,
        session: { mode: is_morphing ? 'Morphing' : 'ImageToVideo' },
      } as any)

    const { newBalance, paymentAmount, success, error } =
      await processBalanceVideoOperation(tempCtxForBalance, videoModel, is_ru)

    if (!success) {
      logger.error('Balance check failed', { telegram_id, error })
      throw new Error(error || 'Failed to process balance operation')
    }

    await bot.telegram.sendMessage(
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
      logger.info('Calling replicate.run', {
        model,
        inputKeys: Object.keys(input),
        telegram_id,
      })
      const result = await replicate.run(model, { input })
      logger.info('replicate.run finished', { telegram_id })
      if (typeof result === 'object' && result !== null && 'output' in result) {
        return result as ReplicateResponse
      } else if (typeof result === 'string' || Array.isArray(result)) {
        return { output: result } as ReplicateResponse
      } else {
        throw new Error('Unexpected result format from replicate.run')
      }
    }

    const replicateModelId = modelConfig.api.model
    let modelInput: any = {}

    if (is_morphing) {
      modelInput = {
        ...modelConfig.api.input,
        image_a: imageAUrl,
        image_b: imageBUrl,
        prompt: prompt || '',
      }
      logger.info('Prepared Replicate input for morphing', {
        telegram_id,
        inputKeys: Object.keys(modelInput),
      })
    } else {
      if (!imageUrl || !prompt) throw new Error('Missing imageUrl or prompt')
      if (!modelConfig.imageKey)
        throw new Error(`Missing imageKey in config for ${videoModel}`)

      modelInput = {
        ...modelConfig.api.input,
        prompt,
        aspect_ratio: userExists.aspect_ratio || '9:16',
        [modelConfig.imageKey]: imageUrl,
      }
      logger.info('Prepared Replicate input for standard (direct URL)', {
        telegram_id,
        inputKeys: Object.keys(modelInput),
      })
    }

    const result = await runModel(
      replicateModelId as
        | `${string}/${string}`
        | `${string}/${string}:${string}`,
      modelInput
    )

    let videoUrl: string | undefined
    if (Array.isArray(result.output)) {
      videoUrl = result.output[0]
    } else if (typeof result.output === 'string') {
      videoUrl = result.output
    }

    logger.info('Generated video URL from Replicate:', { videoUrl })

    if (!videoUrl || !videoUrl.startsWith('http')) {
      throw new Error(`Invalid video URL received from Replicate: ${videoUrl}`)
    }

    const videoLocalPath = path.join(
      __dirname,
      '../uploads',
      telegram_id.toString(),
      'image-to-video',
      `${new Date().toISOString()}.mp4`
    )
    await mkdir(path.dirname(videoLocalPath), { recursive: true })

    const videoBuffer = await downloadFile(videoUrl)
    await writeFile(videoLocalPath, new Uint8Array(videoBuffer))

    await saveVideoUrlToSupabase(
      telegram_id,
      videoUrl,
      videoLocalPath,
      videoModel
    )

    await bot.telegram.sendVideo(telegram_id.toString(), {
      source: videoLocalPath,
    })

    await bot.telegram.sendMessage(
      telegram_id,
      is_ru
        ? `Ваше видео сгенерировано!\n\nСгенерировать еще?\n\nСтоимость: ${paymentAmount.toFixed(
            2
          )} ⭐️\nВаш новый баланс: ${newBalance.toFixed(2)} ⭐️`
        : `Your video has been generated!\n\nGenerate more?\n\nCost: ${paymentAmount.toFixed(
            2
          )} ⭐️\nYour new balance: ${newBalance.toFixed(2)} ⭐️`,
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
      prompt || 'Morphing',
      is_morphing ? 'morphing' : 'image-to-video',
      telegram_id,
      username,
      is_ru,
      validBotName
    )

    return { videoLocalPath }
  } catch (error) {
    logger.error('Error in generateImageToVideo (Plan B):', error)
    await sendServiceErrorToUser(bot, telegram_id, error as Error, is_ru)
    await sendServiceErrorToAdmin(bot, telegram_id, error as Error)

    return null
  }
}
