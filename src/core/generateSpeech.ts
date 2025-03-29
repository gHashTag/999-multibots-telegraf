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
  })

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

  // Отправляем событие для обработки платежа
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
      },
    },
  })

  if (!paymentResult) {
    throw new Error('Payment processing failed')
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
    message: '🎵 Генерация аудио',
    description: 'Generating audio',
    telegram_id,
  })

  // Генерируем аудио
  const audioStream = await elevenLabsClient.generate({
    voice: voice_id,
    model_id: 'eleven_turbo_v2_5',
    text,
  })

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
          })
          reject(error)
        })
    })

    writeStream.on('error', error => {
      logger.error({
        message: '❌ Ошибка записи',
        description: 'Write error',
        error: error instanceof Error ? error.message : String(error),
      })
      reject(error)
    })
  })
}
