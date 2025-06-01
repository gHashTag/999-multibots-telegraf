import { ApiResponse, GenerationResult } from '@/interfaces'
import { replicate } from '@/core/replicate'
import { savePrompt } from '@/core/supabase'
import { downloadFile } from '@/helpers'
import { processApiResponse } from '@/helpers/error'
import { pulse } from '@/helpers/pulse'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { FLUX_KONTEXT_MODELS } from '@/price/models'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { processBalanceOperation } from '@/price/helpers'
import { MyContext } from '@/interfaces'
import { saveFileLocally } from '@/helpers/saveFileLocally'
import path from 'path'
import fs from 'fs'
import { Markup } from 'telegraf'

// Создание клавиатуры для результатов редактирования
const createEditResultKeyboard = (is_ru: boolean) => {
  return Markup.keyboard([
    [
      { text: is_ru ? '✨ Ещё редактирование' : '✨ More editing' },
      { text: is_ru ? '📤 Поделиться' : '📤 Share' },
    ],
    [
      { text: is_ru ? '💾 Сохранить как новую' : '💾 Save as new' },
      { text: is_ru ? '🔙 Назад к оригиналу' : '🔙 Back to original' },
    ],
    [{ text: is_ru ? '🏠 Главное меню' : '🏠 Main menu' }],
  ])
    .resize()
    .oneTime(false)
}

export interface FluxKontextParams {
  prompt: string
  inputImageUrl: string
  modelType: 'pro' | 'max'
  telegram_id: string
  username: string
  is_ru: boolean
  ctx: MyContext
}

export const generateFluxKontext = async (
  params: FluxKontextParams
): Promise<GenerationResult> => {
  try {
    const {
      prompt,
      inputImageUrl,
      modelType,
      telegram_id,
      username,
      is_ru,
      ctx,
    } = params

    const modelKey = `black-forest-labs/flux-kontext-${modelType}`
    const modelConfig = FLUX_KONTEXT_MODELS[modelKey]

    if (!modelConfig) {
      throw new Error(`Неподдерживаемый тип модели: ${modelKey}`)
    }

    // Проверка существования пользователя
    const userExists = await getUserByTelegramIdString(telegram_id)
    if (!userExists) {
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }

    const level = userExists.level
    if (level === 10) {
      await updateUserLevelPlusOne(telegram_id, level)
    }

    // Проверка баланса
    const balanceCheck = await processBalanceOperation({
      ctx,
      telegram_id: Number(telegram_id),
      paymentAmount: modelConfig.costPerImage,
      is_ru,
    })

    if (!balanceCheck.success) {
      throw new Error('Not enough stars')
    }

    // Отправка сообщения о начале редактирования
    ctx.telegram.sendMessage(
      telegram_id,
      is_ru
        ? '✨ Редактирую изображение с помощью FLUX Kontext...'
        : '✨ Editing image with FLUX Kontext...',
      {
        reply_markup: { remove_keyboard: true },
      }
    )

    // Подготовка параметров для API
    const inputParams = {
      prompt,
      input_image: inputImageUrl,
    }

    logger.info(`FLUX Kontext editing started`, {
      modelKey,
      prompt,
      telegram_id,
      inputParams,
    })

    // Генерация отредактированного изображения
    const output: ApiResponse = (await replicate.run(modelKey as any, {
      input: inputParams,
    })) as ApiResponse

    const editedImageUrl = await processApiResponse(output)

    // Сохранение локально
    const imageLocalPath = await saveFileLocally(
      telegram_id,
      editedImageUrl,
      'flux-kontext-edit',
      '.jpeg'
    )

    const imageLocalUrl = `/uploads/${telegram_id}/flux-kontext-edit/${path.basename(
      imageLocalPath
    )}`

    // Сохранение промпта
    const prompt_id = await savePrompt(
      `KONTEXT EDIT: ${prompt}`,
      modelKey,
      imageLocalUrl,
      Number(telegram_id)
    )

    if (prompt_id === null) {
      throw new Error('prompt_id is null')
    }

    // Скачивание для отправки
    const image = await downloadFile(editedImageUrl)

    // Отправка отредактированного изображения
    await ctx.telegram.sendPhoto(
      telegram_id,
      {
        source: fs.createReadStream(imageLocalPath),
      },
      {
        caption: is_ru
          ? `✨ Изображение отредактировано!\n\n📝 Запрос: ${prompt}\n🤖 Модель: FLUX Kontext ${modelType.toUpperCase()}`
          : `✨ Image edited!\n\n📝 Prompt: ${prompt}\n🤖 Model: FLUX Kontext ${modelType.toUpperCase()}`,
        reply_markup: createEditResultKeyboard(is_ru).reply_markup,
      }
    )

    // Pulse для аналитики
    await pulse(
      imageLocalPath,
      `KONTEXT: ${prompt}`,
      `/flux-kontext-${modelType}`,
      telegram_id,
      username,
      is_ru,
      ctx.botInfo?.username ?? 'unknown_bot'
    )

    logger.info(`FLUX Kontext editing completed successfully`, {
      prompt_id,
      telegram_id,
      modelKey,
    })

    return { image, prompt_id }
  } catch (error) {
    logger.error('FLUX Kontext editing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id: params.telegram_id,
      prompt: params.prompt,
    })

    let errorMessageToUser = '❌ Произошла ошибка при редактировании.'
    if (error instanceof Error) {
      if (error.message && error.message.includes('NSFW content detected')) {
        errorMessageToUser = params.is_ru
          ? '❌ Обнаружен NSFW контент. Пожалуйста, попробуйте другой запрос.'
          : '❌ NSFW content detected. Please try another prompt.'
      } else if (error.message && error.message.includes('Not enough stars')) {
        errorMessageToUser = params.is_ru
          ? '❌ Недостаточно звёзд для редактирования изображения.'
          : '❌ Not enough stars for image editing.'
      } else if (error.message) {
        const match = error.message.match(/{"detail":"(.*?)"/)
        if (match) {
          errorMessageToUser = `❌ ${match[1]}`
        }
      }
    }

    params.ctx.telegram.sendMessage(params.telegram_id, errorMessageToUser)
    throw error
  }
}
