import type {
  GenerateSpeechDependencies,
  GenerateSpeechRequest,
  GenerateSpeechResponse,
} from './types'
import { ModeEnum } from '@/interfaces/modes' // Нужно для priceCalculator
import type { InputFile } from 'telegraf/typings/core/types/typegram' // Нужно для sendAudio

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
  } = dependencies

  logger.info('Начало генерации речи', { ...request })

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
      // Примечание: API ключ передается при инициализации клиента elevenlabs,
      // но если нет, его нужно было бы передать здесь или установить глобально.
    })
    logger.info('Получен аудиопоток от ElevenLabs', { telegram_id })

    // --- Работа с файлом ---
    const audioPath = path.join(os.tmpdir(), `audio_${Date.now()}.mp3`)
    const writeStream = fs.createWriteStream(audioPath)
    logger.info('Создан поток записи файла', { audioPath })

    // Ожидание завершения записи в файл
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', async () => {
        logger.info('Запись файла завершена успешно', { audioPath })
        try {
          // Отправка аудио и сообщения пользователю
          const audio: InputFile = { source: audioPath } // Явно указываем тип
          await telegram.sendAudio(telegram_id, audio, {
            reply_markup: {
              keyboard: [
                [
                  { text: is_ru ? '🎙️ Текст в голос' : '🎙️ Text to Speech' },
                  { text: is_ru ? '🏠 Главное меню' : '🏠 Main menu' },
                ],
              ],
              resize_keyboard: true, // Обычно полезно для таких меню
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

          resolve() // Промис успешно разрешен
        } catch (sendError) {
          logger.error('Ошибка при отправке аудио/сообщения после записи', {
            telegram_id,
            error:
              sendError instanceof Error
                ? sendError.message
                : String(sendError),
          })
          try {
            await errorHandlers.sendServiceErrorToAdmin(
              validBotName,
              telegram_id,
              sendError as Error
            )
          } catch (adminError) {
            logger.error('Не удалось отправить ошибку админу', { adminError })
          }
          reject(sendError) // Отклоняем промис
        }
      })

      writeStream.on('error', async error => {
        logger.error('Ошибка при записи аудиофайла', {
          audioPath,
          error: error.message,
        })
        try {
          await errorHandlers.sendServiceErrorToUser(
            validBotName,
            telegram_id,
            error,
            is_ru
          )
          await errorHandlers.sendServiceErrorToAdmin(
            validBotName,
            telegram_id,
            error
          )
        } catch (notifyError) {
          logger.error('Не удалось отправить уведомление об ошибке записи', {
            notifyError,
          })
        }
        reject(error) // Промис отклонен
      })

      // Запускаем поток
      audioStream.pipe(writeStream)
      logger.info('Аудиопоток направлен в поток записи файла', { audioPath })
    })

    // Возвращаем результат после успешного завершения
    return { audioPath }
  } catch (error) {
    logger.error('Ошибка в модуле generateSpeech', {
      ...(error instanceof Error
        ? { error: error.message, stack: error.stack }
        : { error }),
      ...request,
    })
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
