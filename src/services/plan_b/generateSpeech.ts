import { createWriteStream } from 'fs'
import path from 'path'
import os from 'os'
import { elevenlabs } from '@/core/elevenlabs'

import { InputFile } from 'telegraf/typings/core/types/typegram'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import {
  sendServiceErrorToUser,
  sendServiceErrorToAdmin,
} from '@/helpers/error'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { calculateFinalStarPrice } from '@/price/calculator'
import { processBalanceOperation } from '@/price/helpers'
import { PaymentType } from '@/interfaces/payments.interface'
import { getBotByName } from '@/core/bot'
import { toBotName } from '@/helpers/botName.helper'
import logger from '@/utils/logger'

export const generateSpeech = async ({
  text,
  voice_id,
  telegram_id,
  is_ru,
  bot_name,
  ctx,
}: {
  text: string
  voice_id: string
  telegram_id: string
  is_ru: boolean
  bot_name: string
  ctx: MyContext
}): Promise<{ audioUrl: string }> => {
  // 1. Проверки и подготовка - ВНЕ промиса
  console.log('telegram_id', telegram_id)
  const userExists = await getUserByTelegramIdString(telegram_id)
  console.log('userExists', userExists)
  if (!userExists) {
    throw new Error(`User with ID ${telegram_id} does not exist.`)
  }
  const level = userExists.level
  if (level === 7) {
    await updateUserLevelPlusOne(telegram_id, level)
  }

  const costResult = calculateFinalStarPrice(ModeEnum.TextToSpeech)
  if (!costResult) {
    throw new Error('Could not calculate the cost for TextToSpeech.')
  }
  const paymentAmount = costResult.stars

  const balanceCheck = await processBalanceOperation({
    ctx,
    telegram_id: Number(telegram_id),
    paymentAmount,
    is_ru,
  })

  if (!balanceCheck.success) {
    throw new Error(balanceCheck.error)
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY отсутствует')
  }

  // Получаем инстанс бота в начале функции
  const botResult = getBotByName(toBotName(bot_name))
  if (!botResult.bot) {
    // Если бота нет, выбрасываем ошибку, т.к. без него нельзя отправить сообщение
    logger.error('Failed to get bot instance in generateSpeech', {
      bot_name,
      error: botResult.error,
      telegram_id,
    })
    throw new Error(`Bot instance ${bot_name} not found.`)
  }
  const bot = botResult.bot // Сохраняем инстанс бота

  // 2. Асинхронные операции API и потоков - ВНЕ промиса (но в try/catch)
  let audioStream
  try {
    await bot.telegram.sendMessage(
      telegram_id,
      is_ru ? '⏳ Генерация аудио...' : '⏳ Generating audio...'
    )

    audioStream = await elevenlabs.generate({
      voice: voice_id,
      model_id: 'eleven_turbo_v2_5',
      text,
    })
  } catch (error: any) {
    console.error('Error during API call or message sending:', error)
    await sendServiceErrorToUser(bot_name, telegram_id, error as Error, is_ru)
    await sendServiceErrorToAdmin(bot_name, telegram_id, error as Error)
    // Перевыбрасываем ошибку, чтобы она была поймана внешним try/catch, если generateSpeech вызывается внутри него
    throw error
  }

  // 3. Создание пути и потока записи - ВНЕ промиса
  const audioUrl = path.join(os.tmpdir(), `audio_${Date.now()}.mp3`)
  const writeStream = createWriteStream(audioUrl)

  // 4. Промис только для ожидания завершения записи в файл
  await new Promise<void>((resolve, reject) => {
    writeStream.on('finish', async () => {
      try {
        // Отправка сообщений пользователю после успешной записи
        const audio = { source: audioUrl }
        await bot.telegram.sendAudio(telegram_id, audio as InputFile, {
          reply_markup: {
            keyboard: [
              [
                {
                  text: is_ru ? '🎙️ Текст в голос' : '🎙️ Текст в голос',
                },
                { text: is_ru ? '🏠 Главное меню' : '🏠 Main menu' },
              ],
            ],
          },
        })
        await bot.telegram.sendMessage(
          telegram_id,
          is_ru
            ? `Стоимость: ${paymentAmount.toFixed(2)} ⭐️\nВаш баланс: ${(balanceCheck.newBalance || 0).toFixed(2)} ⭐️`
            : `Cost: ${paymentAmount.toFixed(2)} ⭐️\nYour balance: ${(balanceCheck.newBalance || 0).toFixed(2)} ⭐️`
        )
        resolve() // Промис успешно разрешен
      } catch (sendError) {
        console.error(
          'Error sending audio or message after write finish:',
          sendError
        )
        // Пытаемся уведомить админа
        try {
          await sendServiceErrorToAdmin(
            bot_name,
            telegram_id,
            sendError as Error
          )
        } catch (adminError) {
          console.error('Failed to send error to admin:', adminError)
        }
        // Отклоняем промис, так как отправка не удалась
        reject(sendError)
      }
    })

    writeStream.on('error', async error => {
      console.error('Error writing audio file:', error)
      try {
        // Пытаемся уведомить пользователя и админа об ошибке записи файла
        await sendServiceErrorToUser(
          bot_name,
          telegram_id,
          error as Error,
          is_ru
        )
        await sendServiceErrorToAdmin(bot_name, telegram_id, error as Error)
      } catch (notifyError) {
        console.error('Failed to send write error notification:', notifyError)
      }
      reject(error) // Промис отклонен из-за ошибки записи
    })

    // Запускаем поток
    audioStream.pipe(writeStream)
  })

  // 5. Возвращаем результат после успешного завершения промиса
  return { audioUrl }

  // Внешний try/catch не нужен здесь, так как ошибки API/потоков
  // обрабатываются внутри и либо перевыбрасываются (API), либо отклоняют промис (запись)
}
