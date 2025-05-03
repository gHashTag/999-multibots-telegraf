import { GenerationResult, MyContext } from '@/interfaces'
import { Telegraf } from 'telegraf'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { calculateFinalStarPrice } from '@/price/calculator'
import { GenerateTextToImageDependencies } from './types'
import { determineImageSize } from './utils/sizeCalculator'

interface GenerateTextToImageRequest {
  prompt: string
  model_type: string
  num_images: number
  telegram_id: string
  username: string
  is_ru: boolean
}

export const generateTextToImage = async (
  requestData: GenerateTextToImageRequest,
  dependencies: GenerateTextToImageDependencies
): Promise<GenerationResult[]> => {
  const {
    logger,
    supabase,
    replicate,
    telegram,
    fsCreateReadStream,
    pathBasename,
    processBalance,
    processImageApiResponse,
    saveImagePrompt,
    saveImageLocally,
    getAspectRatio,
    sendErrorToUser,
    sendErrorToAdmin,
    imageModelsConfig,
  } = dependencies

  const { prompt, model_type, num_images, telegram_id, username, is_ru } =
    requestData

  try {
    const modelKey = model_type.toLowerCase()
    const modelConfig = imageModelsConfig[modelKey]
    logger.info('Model Config:', { modelConfig })

    const { data: userExists, error: userError } = await supabase
      .from('users')
      .select('level, aspect_ratio')
      .eq('telegram_id', telegram_id)
      .single()

    if (userError || !userExists) {
      logger.error('Error fetching user or user not found', {
        telegram_id,
        error: userError,
      })
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }
    const level = userExists.level
    if (level === 10) {
      const { error: levelUpError } = await supabase.rpc(
        'increment_user_level',
        { user_tid: telegram_id }
      )
      if (levelUpError) {
        logger.error('Error incrementing user level', {
          telegram_id,
          levelUpError,
        })
      }
    }

    if (!modelConfig) {
      throw new Error(`Неподдерживаемый тип модели: ${model_type}`)
    }

    const costPerImageResult = calculateFinalStarPrice(ModeEnum.TextToImage, {
      modelId: modelKey,
    })
    if (!costPerImageResult) {
      throw new Error(`Could not calculate cost for model: ${modelKey}`)
    }
    const costPerImage = costPerImageResult.stars
    const totalCost = costPerImage * num_images

    const tempCtx = {
      from: { id: Number(telegram_id) },
    } as any
    const balanceCheck = await processBalance(tempCtx, modelKey, is_ru)
    logger.info('Balance Check Result:', { balanceCheck })

    if (!balanceCheck.success) {
      throw new Error('Insufficient stars')
    }

    const aspect_ratio = userExists.aspect_ratio || '1:1'

    const size = determineImageSize(model_type, aspect_ratio)

    const input = {
      prompt,
      ...(size ? { size } : { aspect_ratio }),
    }
    logger.info('Replicate Input:', { input })

    const results: GenerationResult[] = []

    for (let i = 0; i < num_images; i++) {
      try {
        const replicateModelKey = Object.keys(imageModelsConfig).find(
          key => key === model_type.toLowerCase()
        ) as `${string}/${string}` | `${string}/${string}:${string}` | undefined

        if (!replicateModelKey) {
          throw new Error(
            `Could not find Replicate model key for ${model_type}`
          )
        }

        logger.info(`Generating image ${i + 1}/${num_images}`, {
          replicateModelKey,
        })

        if (num_images > 1) {
          await telegram.sendMessage(
            telegram_id,
            is_ru
              ? `⏳ Генерация изображения ${i + 1} из ${num_images}`
              : `⏳ Generating image ${i + 1} of ${num_images}`
          )
        } else {
          await telegram.sendMessage(
            telegram_id,
            is_ru ? '⏳ Генерация...' : '⏳ Generating...',
            {
              reply_markup: { remove_keyboard: true },
            }
          )
        }

        const output: unknown = await replicate.run(replicateModelKey, {
          input,
        })

        logger.info(
          `Processing Replicate API response... Sample: ${JSON.stringify(output).substring(0, 50)}...`,
          {
            description: 'Processing Replicate API response',
            output_sample: JSON.stringify(output).substring(0, 100) + '...',
          }
        )

        const imageUrl = await processImageApiResponse(
          output as string[] | string
        )

        if (!imageUrl || !imageUrl.startsWith('http')) {
          throw new Error(`Invalid image URL: ${imageUrl}`)
        }

        const imageLocalPath = await saveImageLocally(
          telegram_id,
          imageUrl,
          'text-to-image',
          '.jpeg'
        )

        const imageLocalUrl = `/uploads/${telegram_id}/text-to-image/${pathBasename(
          imageLocalPath
        )}`

        const prompt_id = await saveImagePrompt(
          prompt,
          modelKey,
          imageLocalUrl,
          Number(telegram_id)
        )

        await telegram.sendPhoto(telegram_id, {
          source: fsCreateReadStream(imageLocalPath),
        })

        results.push({
          image: imageLocalUrl,
          prompt_id: prompt_id,
        })
      } catch (loopError) {
        logger.error(`Error generating image ${i + 1}:`, { error: loopError })
      }
    }

    if (results.length > 0) {
      await telegram.sendMessage(
        telegram_id,
        is_ru
          ? `✅ ${results.length === 1 ? 'Ваше изображение' : 'Ваши изображения'} (${results.length} из ${num_images}) сгенерирован${results.length === 1 ? 'о' : 'ы'}!\n\nВыберите количество для следующей генерации или другую опцию.\n\nВаш баланс: ${(balanceCheck.newBalance ?? 0).toFixed(2)} ⭐️`
          : `✅ Your image${results.length === 1 ? '' : 's'} (${results.length}/${num_images}) ${results.length === 1 ? 'has' : 'have'} been generated!\n\nSelect quantity for next generation or another option.\n\nYour balance: ${(balanceCheck.newBalance ?? 0).toFixed(2)} ⭐️`,
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
    } else {
      await telegram.sendMessage(
        telegram_id,
        is_ru
          ? `❌ Не удалось сгенерировать изображения по вашему запросу. Попробуйте изменить промпт или модель.`
          : `❌ Failed to generate images for your request. Try changing the prompt or model.`
      )
    }

    return results
  } catch (error) {
    logger.error('Error in generateTextToImage:', { error })
    try {
      await telegram.sendMessage(
        telegram_id,
        is_ru
          ? 'Произошла ошибка при генерации изображения. Пожалуйста, попробуйте позже.'
          : 'An error occurred during image generation. Please try again later.'
      )
    } catch (replyError) {
      logger.error('Failed to send error reply:', { replyError })
    }
    throw error
  }
}
