import { GenerateTextToVideoDependencies } from './types'
import { Markup } from 'telegraf'
import type { VideoModelConfig } from '@/price/models/VIDEO_MODELS_CONFIG'

// Определяем тип локально, но конфиг будем брать из зависимостей
// type VideoModelConfigKey = keyof typeof VIDEO_MODELS_CONFIG;
// Используем тип из импортированной VideoModelConfig
type VideoModelConfigKey = keyof Record<string, VideoModelConfig>

// Определяем интерфейс для входных данных функции
interface GenerateTextToVideoRequest {
  prompt: string
  videoModel: VideoModelConfigKey
  telegram_id: string
  username: string
  is_ru: boolean
  bot_name: string
}

export const generateTextToVideo = async (
  requestData: GenerateTextToVideoRequest,
  dependencies: GenerateTextToVideoDependencies
): Promise<{ videoLocalPath: string }> => {
  // Извлекаем зависимости из аргумента
  const {
    logger,
    supabase,
    telegram,
    fs,
    processBalance,
    generateVideoInternal,
    sendErrorToUser,
    sendErrorToAdmin,
    pulseHelper,
    videoModelsConfig,
    pathJoin,
    pathDirname,
    toBotName,
  } = dependencies

  // Извлекаем данные запроса
  const { prompt, videoModel, telegram_id, username, is_ru, bot_name } =
    requestData

  // Используем videoModelsConfig из зависимостей
  const currentVideoModelsConfig = videoModelsConfig

  // Используем toBotName из зависимостей
  const validBotName = toBotName(bot_name)

  try {
    // Используем logger из зависимостей
    logger.info('videoModel', String(videoModel))
    if (!prompt) throw new Error('Prompt is required')
    if (!videoModel) throw new Error('Video model is required')
    if (!telegram_id) throw new Error('Telegram ID is required')
    if (!username) throw new Error('Username is required')
    if (!validBotName) throw new Error('Bot name is required')

    // Используем supabase из зависимостей
    const { data: userExists, error: userError } = await supabase
      .from('users')
      .select('level')
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
    if (level === 9) {
      // Используем supabase из зависимостей
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

    // Создаем временный контекст только для processBalance
    const tempCtxForBalance = {
      from: { id: Number(telegram_id), username },
      botInfo: { username: validBotName },
      session: { mode: 'TextToVideo' },
    } as any

    // Используем processBalance из зависимостей
    const {
      newBalance,
      paymentAmount,
      success,
      error: balanceError,
    } = await processBalance(tempCtxForBalance, String(videoModel), is_ru)

    if (!success) {
      logger.error('Error processing balance for video generation:', {
        telegram_id,
        videoModel: String(videoModel),
        error: balanceError,
      })
      throw new Error(balanceError || 'Failed to process balance operation')
    }

    // Используем telegram из зависимостей
    await telegram.sendMessage(
      telegram_id,
      is_ru ? '⏳ Генерация видео...' : '⏳ Generating video...',
      {
        reply_markup: {
          remove_keyboard: true,
        },
      }
    )

    // Используем currentVideoModelsConfig (полученный из зависимостей)
    const modelConfig = currentVideoModelsConfig[String(videoModel)]
    if (!modelConfig) {
      throw new Error(
        `Invalid video model configuration for: ${String(videoModel)}`
      )
    }

    // Используем generateVideoInternal из зависимостей
    const videoOutput = await generateVideoInternal(
      prompt,
      modelConfig.api.model,
      modelConfig.api.input.negative_prompt || ''
    )

    let videoUrl: string
    if (Array.isArray(videoOutput)) {
      if (!videoOutput[0]) {
        throw new Error('Empty array or first element is undefined')
      }
      videoUrl = videoOutput[0]
    } else if (typeof videoOutput === 'string') {
      videoUrl = videoOutput
    } else {
      logger.error(
        'Unexpected output format:',
        JSON.stringify(videoOutput, null, 2)
      )
      throw new Error(
        `Unexpected output format from API: ${typeof videoOutput}`
      )
    }

    // Используем pathJoin из зависимостей
    const videoLocalPath = pathJoin(
      './uploads',
      telegram_id.toString(),
      'text-to-video',
      `${new Date().toISOString()}.mp4`
    )
    logger.info(videoLocalPath, 'videoLocalPath')

    // Используем fs.mkdir и pathDirname из зависимостей
    await fs.mkdir(pathDirname(videoLocalPath), { recursive: true })

    logger.info('Skipping video file writing - needs clarification.')

    // Используем supabase из зависимостей
    const { error: saveError } = await supabase.from('videos').insert([
      {
        telegram_id: telegram_id,
        video_url: videoUrl,
        local_path: videoLocalPath,
        model_id: String(videoModel),
        prompt: prompt,
      },
    ])
    if (saveError) {
      logger.error('Error saving video URL to Supabase', {
        telegram_id,
        saveError,
      })
    }

    // Отправляем видео пользователю, если путь доступен
    if (videoLocalPath) {
      // TODO: Пересмотреть отправку локального файла, возможно нужна URL ссылка?
      logger.info('Skipping sending video via local path - needs adjustment.')
      // await telegram.sendVideo(params.telegram_id, { source: videoLocalPath });
    }

    // Используем telegram из зависимостей
    await telegram.sendMessage(
      telegram_id,
      is_ru
        ? `Ваше видео сгенерировано!\n\nСгенерировать еще?\n\nСтоимость: ${paymentAmount?.toFixed(
            2
          )} ⭐️\nВаш новый баланс: ${newBalance?.toFixed(2)} ⭐️`
        : `Your video has been generated!\n\nGenerate more?\n\nCost: ${paymentAmount?.toFixed(
            2
          )} ⭐️\nYour new balance: ${newBalance?.toFixed(2)} ⭐️`,
      Markup.keyboard([
        [
          Markup.button.text(
            is_ru ? '🎥 Сгенерировать новое видео?' : '🎥 Generate new video?'
          ),
        ],
      ]).resize(false)
    )

    // Используем pulseHelper из зависимостей
    await pulseHelper(
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
    // Используем sendErrorToUser и sendErrorToAdmin из зависимостей
    await sendErrorToUser(validBotName, telegram_id, error as Error, is_ru)
    await sendErrorToAdmin(validBotName, telegram_id, error as Error)

    if (error instanceof Error) {
      console.error('Error name:', error.name)
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }
    throw error
  }
}
