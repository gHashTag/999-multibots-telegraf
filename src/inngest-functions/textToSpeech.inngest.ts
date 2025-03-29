import { inngest } from '@/core/inngest/clients'
import { getBotByName } from '@/core/bot'
import { ModeEnum, calculateModeCost } from '@/price/helpers/modelsCost'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import elevenlabs from '@/core/elevenlabs'
import { createWriteStream } from 'fs'
import path from 'path'
import os from 'os'
import fs from 'fs'

// Интерфейс для параметров текст-в-речь
interface TextToSpeechParams {
  text: string
  voice_id: string
  telegram_id: string
  is_ru: boolean
  bot: Telegraf<MyContext>
  bot_name: string
}

// Функция для генерации речи
const generateSpeech = async ({
  text,
  voice_id,
  telegram_id,
  is_ru,
  bot,
  bot_name,
}: TextToSpeechParams) => {
  logger.info({
    message: '🎙️ Начало генерации речи',
    description: 'Starting speech generation',
    telegram_id,
  })

  // Проверяем существование пользователя
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegram_id)
    .single()

  if (userError || !user) {
    logger.error({
      message: '❌ Пользователь не найден',
      description: 'User not found in database',
      telegram_id,
      error: userError,
    })
    await bot.telegram.sendMessage(
      telegram_id,
      is_ru ? '❌ Ошибка: пользователь не найден' : '❌ Error: user not found'
    )
    throw new Error(`User with ID ${telegram_id} does not exist.`)
  }

  // Проверяем баланс
  const cost = calculateModeCost({ mode: ModeEnum.TextToSpeech }).stars

  if (user.balance < cost) {
    logger.warn({
      message: '⚠️ Недостаточно средств',
      description: 'Insufficient funds for text-to-speech',
      telegram_id,
      balance: user.balance,
      cost,
    })
    await bot.telegram.sendMessage(
      telegram_id,
      is_ru
        ? `❌ Недостаточно звезд. Необходимо: ${cost}⭐, у вас: ${user.balance}⭐`
        : `❌ Insufficient stars. Required: ${cost}⭐, you have: ${user.balance}⭐`
    )
    throw new Error('Insufficient funds')
  }

  try {
    // Отправляем сообщение о начале генерации
    await bot.telegram.sendMessage(
      telegram_id,
      is_ru ? '⏳ Генерация аудио...' : '⏳ Generating audio...'
    )

    // Генерируем аудио с помощью ElevenLabs SDK
    logger.info({
      message: '🎵 Генерация аудио потока',
      description: 'Generating audio stream',
      telegram_id,
    })

    const audioStream = await elevenlabs.generate({
      voice: voice_id,
      model_id: 'eleven_turbo_v2_5',
      text,
    })

    // Сохраняем аудио во временный файл
    const audioUrl = path.join(os.tmpdir(), `audio_${Date.now()}.mp3`)
    const writeStream = createWriteStream(audioUrl)

    await new Promise<void>((resolve, reject) => {
      audioStream.pipe(writeStream)

      writeStream.on('finish', () => {
        resolve()
      })

      writeStream.on('error', error => {
        reject(error)
      })
    })

    // Отправляем событие для обработки платежа
    await inngest.send({
      name: 'payment/process',
      data: {
        amount: -cost,
        telegram_id,
        type: 'text-to-speech',
        description: 'Payment for text to speech generation',
        bot_name,
      },
    })

    try {
      // Отправляем аудио пользователю
      await bot.telegram.sendVoice(telegram_id, { source: audioUrl })

      // Отправляем сообщение об успешной генерации
      await bot.telegram.sendMessage(
        telegram_id,
        is_ru
          ? `✅ Аудио сгенерировано! Потрачено ${cost}⭐`
          : `✅ Audio generated! Spent ${cost}⭐`
      )

      logger.info({
        message: '✅ Аудио успешно сгенерировано',
        description: 'Audio successfully generated',
        telegram_id,
      })
    } finally {
      // Удаляем временный файл
      fs.unlink(audioUrl, unlinkError => {
        if (unlinkError) {
          logger.error({
            message: '❌ Ошибка при удалении временного файла',
            description: 'Error deleting temporary file',
            telegram_id,
            error: unlinkError.message,
          })
        } else {
          logger.info({
            message: '🗑️ Временный файл удален',
            description: 'Temporary file deleted',
            telegram_id,
            audioUrl,
          })
        }
      })
    }

    return { success: true }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка генерации аудио',
      description: 'Error generating audio',
      telegram_id,
      error,
    })

    await bot.telegram.sendMessage(
      telegram_id,
      is_ru
        ? '❌ Произошла ошибка при генерации аудио'
        : '❌ An error occurred while generating audio'
    )

    throw error
  }
}

// Создаем Inngest функцию
export const textToSpeech = inngest.createFunction(
  { id: 'text-to-speech' },
  { event: 'text-to-speech.requested' },
  async ({ event, step }) => {
    const { text, voice_id, telegram_id, is_ru, bot_name } = event.data

    logger.info({
      message: '🚀 Запуск функции text-to-speech',
      description: 'Starting text-to-speech function',
      data: event.data,
    })

    // Получаем экземпляр бота
    const botData = await step.run('get-bot', () => {
      logger.info({
        message: '🤖 Получение экземпляра бота',
        description: 'Getting bot instance',
        bot_name,
        telegram_id,
      })
      return getBotByName(bot_name)
    })

    logger.info({
      message: '✅ Бот получен',
      description: 'Bot instance retrieved',
      bot_name,
      has_bot: !!botData,
      has_bot_instance: !!(botData as any).bot,
      telegram_id,
    })

    const bot = (botData as any).bot

    if (!bot) {
      logger.error({
        message: '❌ Бот не найден',
        description: 'Bot instance not found',
        bot_name,
        telegram_id,
      })
      throw new Error(`Bot ${bot_name} not found`)
    }

    // Генерируем речь
    return step.run('generate-speech', () => {
      logger.info({
        message: '🎯 Начало генерации речи',
        description: 'Starting speech generation',
        telegram_id,
        text_length: text.length,
      })

      return generateSpeech({
        text,
        voice_id,
        telegram_id,
        is_ru,
        bot,
        bot_name,
      })
    })
  }
)
