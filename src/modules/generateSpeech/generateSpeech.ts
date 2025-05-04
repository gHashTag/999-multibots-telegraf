import type {
  GenerateSpeechDependencies,
  GenerateSpeechRequest,
  GenerateSpeechResponse,
} from './types'
import { ModeEnum } from '@/interfaces/modes' // Нужно для priceCalculator
import type { InputFile } from 'telegraf/typings/core/types/typegram' // Нужно для sendAudio
import { Readable } from 'stream'

export const generateSpeech = async (
  request: GenerateSpeechRequest,
  dependencies: GenerateSpeechDependencies
): Promise<GenerateSpeechResponse> => {
  const { text, voice_id, telegram_id, is_ru, bot_name } = request
  const {
    logger,
    elevenlabs,
    fs,
    path,
    os,
    supabase,
    errorHandlers,
    priceCalculator,
    balanceProcessor,
    telegramApiProvider,
    helpers,
    elevenlabsApiKey,
    streamPipeline,
  } = dependencies

  logger.info('Начало генерации речи', { ...request })
  let audioPath = ''

  try {
    // --- Проверки и подготовка ---
    const validBotName = helpers.toBotName(bot_name)
    if (!validBotName) {
      throw new Error('Не удалось определить имя бота.')
    }

    const userExists = await supabase.getUserByTelegramIdString(telegram_id)
    if (!userExists) {
      throw new Error(`Пользователь с ID ${telegram_id} не найден.`)
    }

    // Обновление уровня (если нужно)
    const level = userExists.level
    if (level === 7) {
      await supabase.updateUserLevelPlusOne(telegram_id, level)
      logger.info('Уровень пользователя обновлен', { telegram_id, newLevel: 8 })
    }

    // Расчет стоимости
    const costResult = priceCalculator(ModeEnum.TextToSpeech)
    if (!costResult) {
      throw new Error('Не удалось рассчитать стоимость для TextToSpeech.')
    }
    const paymentAmount = costResult.stars
    logger.info('Стоимость операции рассчитана', { telegram_id, paymentAmount })

    // Проверка и списание баланса
    const balanceCheck = await balanceProcessor({
      telegram_id: Number(telegram_id),
      paymentAmount,
      is_ru,
      // TODO: Передать другие необходимые параметры, если processBalanceOperation изменился
    })

    if (!balanceCheck.success || !balanceCheck.newBalance) {
      throw new Error(
        balanceCheck.error || 'Ошибка при проверке/списании баланса.'
      )
    }
    logger.info('Баланс успешно проверен и списан', {
      telegram_id,
      newBalance: balanceCheck.newBalance,
    })

    if (!elevenlabsApiKey) {
      throw new Error('API ключ ElevenLabs отсутствует.')
    }

    // Получение Telegram API
    const telegram = await telegramApiProvider.getTelegramApi(validBotName)
    if (!telegram) {
      throw new Error(
        `Инстанс Telegram API для бота ${validBotName} не найден.`
      )
    }

    // --- Асинхронные операции API и потоков ---
    await telegram.sendMessage(
      telegram_id,
      is_ru ? '⏳ Генерация аудио...' : '⏳ Generating audio...'
    )
    logger.info('Отправлено сообщение о начале генерации', { telegram_id })

    const audioStream = await elevenlabs.generate({
      voice: voice_id,
      model_id: 'eleven_turbo_v2_5',
      text,
    })
    logger.info('Получен аудиопоток от ElevenLabs', { telegram_id })

    // --- Работа с файлом и потоком ---
    audioPath = path.join(os.tmpdir(), `audio_${Date.now()}.mp3`)
    const writeStream = fs.createWriteStream(audioPath)
    logger.info('Создан поток записи файла', { audioPath })

    await streamPipeline(audioStream, writeStream)
    logger.info('Поток успешно записан в файл', { audioPath })

    // --- Отправка результата пользователю ---
    try {
      const audio: InputFile = { source: audioPath }
      await telegram.sendAudio(telegram_id, audio, {
        reply_markup: {
          keyboard: [
            [
              { text: is_ru ? '🎙️ Текст в голос' : '🎙️ Text to Speech' },
              { text: is_ru ? '🏠 Главное меню' : '🏠 Main menu' },
            ],
          ],
          resize_keyboard: true,
        },
      })
      logger.info('Аудиофайл отправлен пользователю', { telegram_id })

      await telegram.sendMessage(
        telegram_id,
        is_ru
          ? `Стоимость: ${paymentAmount.toFixed(2)} ⭐️\nВаш баланс: ${balanceCheck.newBalance?.toFixed(2)} ⭐️`
          : `Cost: ${paymentAmount.toFixed(2)} ⭐️\nYour balance: ${balanceCheck.newBalance?.toFixed(2)} ⭐️`
      )
      logger.info('Сообщение о стоимости и балансе отправлено', {
        telegram_id,
      })
    } catch (sendError) {
      logger.error('Ошибка при отправке аудио/сообщения после записи', {
        telegram_id,
        error:
          sendError instanceof Error ? sendError.message : String(sendError),
      })
      // Попытка уведомить админа об ошибке отправки
      try {
        await errorHandlers.sendServiceErrorToAdmin(
          validBotName,
          telegram_id,
          sendError as Error
        )
      } catch (adminError) {
        logger.error('Не удалось отправить ошибку отправки админу', {
          adminError,
        })
      }
      // Не перебрасываем ошибку отправки, так как аудио уже сгенерировано
      // Но можно добавить логику возврата ошибки, если нужно
    }

    // Возвращаем результат после успешного завершения
    return { audioPath }
  } catch (error) {
    logger.error('Ошибка в модуле generateSpeech', {
      ...(error instanceof Error
        ? { error: error.message, stack: error.stack }
        : { error }),
      ...request,
    })

    // ИЗМЕНЕНИЕ: Удаляем временный файл, если он был создан и произошла ошибка
    if (audioPath) {
      try {
        // Нужен fs.promises.unlink для удаления
        // Добавить fs.promises.unlink в зависимости?
        // Пока просто логируем, что нужно удалить
        logger.warn('Требуется удаление временного файла при ошибке:', {
          audioPath,
        })
      } catch (unlinkError) {
        logger.error('Ошибка при попытке удаления временного файла', {
          audioPath,
          unlinkError,
        })
      }
    }

    // Попытка отправить ошибку пользователю и админу
    try {
      const validBotName = helpers.toBotName(bot_name) ?? 'unknown_bot' // Fallback
      await errorHandlers.sendServiceErrorToUser(
        validBotName,
        telegram_id,
        error as Error,
        is_ru
      )
      await errorHandlers.sendServiceErrorToAdmin(
        validBotName,
        telegram_id,
        error as Error
      )
    } catch (notifyError) {
      logger.error(
        'Не удалось отправить уведомление об ошибке из главного catch',
        {
          notifyError,
        }
      )
    }
    // Перебрасываем ошибку, чтобы вызывающий код знал о проблеме
    throw error
  }
}
