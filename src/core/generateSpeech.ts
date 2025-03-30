import { createWriteStream } from 'fs'
import path from 'path'
import os from 'os'
import elevenLabsClient from './elevenlabs'
import { InputFile } from 'telegraf/typings/core/types/typegram'
import { getUserByTelegramId, updateUserLevelPlusOne } from './supabase'

import { Telegraf } from 'telegraf'
import { MyContext } from '../interfaces'
import { modeCosts, ModeEnum } from '../price/helpers/modelsCost'
import { logger } from '../utils/logger'
import fs from 'fs'
import { inngest } from '../core/inngest/clients'

// Функция для валидации текста
const validateText = (text: string): boolean => {
  if (!text || text.trim().length === 0) {
    return false
  }
  // Проверяем на спецсимволы, которые могут вызвать ошибку
  const invalidChars = /[^\p{L}\p{N}\p{P}\s]/u
  return !invalidChars.test(text)
}

export const generateSpeech = async ({
  text,
  voice_id,
  telegram_id,
  is_ru,
  bot,
  bot_name,
}: {
  text: string
  voice_id: string
  telegram_id: string
  is_ru: boolean
  bot: Telegraf<MyContext>
  bot_name: string
}): Promise<{ audioUrl: string }> => {
  logger.info({
    message: '🎙️ Начало generateSpeech',
    description: 'Starting generateSpeech',
    telegram_id,
    text_length: text?.length,
    voice_id,
  })

  // Валидация входных данных
  if (!validateText(text)) {
    logger.error({
      message: '❌ Некорректный текст',
      description: 'Invalid text input',
      telegram_id,
      text_length: text?.length,
    })
    throw new Error('Invalid text input')
  }

  const userExists = await getUserByTelegramId(telegram_id)
  logger.info({
    message: '👤 Проверка пользователя',
    description: 'User check',
    telegram_id,
    userExists,
  })

  if (!userExists) {
    throw new Error(`User with ID ${telegram_id} does not exist.`)
  }

  const level = userExists.level
  if (level === 7) {
    await updateUserLevelPlusOne(telegram_id, level)
  }

  // Проверяем наличие API ключа
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY отсутствует')
  }

  // Отправляем сообщение о начале генерации
  await bot.telegram.sendMessage(
    telegram_id,
    is_ru ? '⏳ Генерация аудио...' : '⏳ Generating audio...'
  )

  logger.info({
    message: '🎯 Отправляем запрос к ElevenLabs API',
    description: 'Sending request to ElevenLabs API',
    telegram_id,
    voice_id,
    text_length: text.length,
    model_id: 'eleven_turbo_v2_5',
  })

  try {
    // Генерируем аудио
    const audioStream = await elevenLabsClient.generate({
      voice: voice_id,
      model_id: 'eleven_turbo_v2_5',
      text,
    })

    logger.info({
      message: '✅ Аудио успешно сгенерировано',
      description: 'Audio generated successfully',
      telegram_id,
    })

    // Если генерация успешна, отправляем событие для обработки платежа
    const paymentResult = await inngest.send({
      name: 'payment/process',
      data: {
        telegram_id,
        paymentAmount: modeCosts[ModeEnum.TextToSpeech] as number,
        is_ru,
        bot_name,
        description: 'Payment for text to speech',
        type: 'outcome',
        metadata: {
          service_type: 'Text to speech',
          text_length: text.length,
          voice_id,
        },
      },
    })

    if (!paymentResult) {
      throw new Error('Payment processing failed')
    }

    return new Promise<{ audioUrl: string }>((resolve, reject) => {
      const audioUrl = path.join(os.tmpdir(), `audio_${Date.now()}.mp3`)
      const writeStream = createWriteStream(audioUrl)

      audioStream.pipe(writeStream)

      writeStream.on('finish', () => {
        logger.info({
          message: '📤 Отправка аудио',
          description: 'Sending audio',
          telegram_id,
          audioUrl,
        })

        const audio = { source: audioUrl }
        bot.telegram
          .sendAudio(telegram_id, audio as InputFile, {
            reply_markup: {
              keyboard: [
                [
                  {
                    text: is_ru ? '🎙️ Текст в голос' : '🎙️ Text to voice',
                  },
                  { text: is_ru ? '🏠 Главное меню' : '🏠 Main menu' },
                ],
              ],
            },
          })
          .then(() => {
            logger.info({
              message: '✅ Аудио отправлено',
              description: 'Audio sent',
              telegram_id,
            })

            // Удаляем временный файл
            fs.unlink(audioUrl, err => {
              if (err) {
                logger.error({
                  message: '❌ Ошибка удаления файла',
                  description: 'File deletion error',
                  error: err.message,
                })
              } else {
                logger.info({
                  message: '🗑️ Файл удален',
                  description: 'File deleted',
                  audioUrl,
                })
              }
            })

            resolve({ audioUrl })
          })
          .catch(error => {
            logger.error({
              message: '❌ Ошибка отправки аудио',
              description: 'Audio send error',
              error: error instanceof Error ? error.message : String(error),
              telegram_id,
            })
            reject(error)
          })
      })

      writeStream.on('error', error => {
        logger.error({
          message: '❌ Ошибка записи',
          description: 'Write error',
          error: error instanceof Error ? error.message : String(error),
          telegram_id,
        })
        reject(error)
      })
    })
  } catch (error) {
    logger.error({
      message: '❌ Ошибка генерации аудио',
      description: 'Audio generation error',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
      text_length: text.length,
      voice_id,
    })

    // Отправляем сообщение об ошибке пользователю
    const errorMessage = error instanceof Error ? error.message : String(error)
    const isInvalidVoice = errorMessage.includes('400 Bad Request')

    await bot.telegram.sendMessage(
      telegram_id,
      is_ru
        ? isInvalidVoice
          ? '❌ Ошибка: неверный голос. Пожалуйста, выберите другой голос или обратитесь в поддержку.'
          : '❌ Произошла ошибка при генерации аудио. Пожалуйста, попробуйте позже или обратитесь в поддержку.'
        : isInvalidVoice
        ? '❌ Error: invalid voice. Please select another voice or contact support.'
        : '❌ An error occurred while generating audio. Please try again later or contact support.'
    )

    throw error
  }
}
