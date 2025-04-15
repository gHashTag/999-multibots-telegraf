import { inngest } from './clients'
import { OpenAI, toFile } from 'openai'
import { logger } from '@/utils/logger'
import { sendSafeFormattedMessage } from '@/handlers/handleTextMessage'
import { answerAi } from '@/core/openai'
import { getUserByTelegramIdString } from '@/core/supabase'
import { ModeEnum } from '@/price/helpers/modelsCost'
import fetch from 'node-fetch'
import { Context } from 'telegraf'
import { Update } from 'telegraf/typings/core/types/typegram'
import * as fs from 'fs'
import * as path from 'path'
import { getBotByName } from '@/core/bot'
import { supabase } from '@/core/supabase'

// Поддерживаемые форматы аудио
const SUPPORTED_FORMATS = [
  'flac',
  'm4a',
  'mp3',
  'mp4',
  'mpeg',
  'mpga',
  'oga',
  'ogg',
  'wav',
  'webm',
]
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB - максимальный размер для Whisper API

export const voiceToTextProcessor = inngest.createFunction(
  {
    id: 'voice-to-text-processor',
    name: 'voice-to-text.requested',
  },
  { event: 'voice-to-text.requested' },
  async ({ event }) => {
    console.log(
      '🚀 Начало обработки голосового сообщения [Starting voice message processing]'
    )
    console.log('📦 Данные события:', {
      fileUrl: event.data.fileUrl,
      telegram_id: event.data.telegram_id,
      is_ru: event.data.is_ru,
      bot_name: event.data.bot_name,
      username: event.data.username,
    })

    const { fileUrl, telegram_id, is_ru, bot_name, username } = event.data

    try {
      // Получаем пользователя
      console.log('👤 Поиск пользователя:', telegram_id)
      const user = await getUserByTelegramIdString(telegram_id)
      if (!user) {
        console.error('❌ Пользователь не найден')
        throw new Error('Пользователь не найден')
      }
      console.log('✅ Пользователь найден:', user.username)

      // Проверяем и устанавливаем модель по умолчанию
      if (!user.model || user.model === 'default') {
        console.log('🔄 Установка модели по умолчанию [Setting default model]')
        user.model = 'gpt-3.5-turbo' // Устанавливаем gpt-3.5-turbo как модель по умолчанию
      }
      console.log('🤖 Используемая модель:', user.model)

      // Получаем аудио файл
      console.log('🎵 Получение аудио файла [Getting audio file]')
      console.log('🔗 URL файла:', fileUrl)
      let audioBuffer: Buffer
      let fileExtension: string

      if (fileUrl.startsWith('file://')) {
        console.log('📂 Чтение локального файла [Reading local file]')
        // Читаем локальный файл
        const filePath = fileUrl.slice(7) // Убираем 'file://'
        fileExtension = path.extname(filePath).slice(1).toLowerCase()
        console.log('📄 Расширение файла:', fileExtension)

        if (!SUPPORTED_FORMATS.includes(fileExtension)) {
          console.error('❌ Неподдерживаемый формат файла:', fileExtension)
          throw new Error(
            `Неподдерживаемый формат файла. Поддерживаемые форматы: ${SUPPORTED_FORMATS.join(', ')}`
          )
        }

        const stats = fs.statSync(filePath)
        console.log('📊 Размер файла:', stats.size)
        if (stats.size > MAX_FILE_SIZE) {
          console.error('❌ Файл слишком большой:', stats.size)
          throw new Error(
            `Файл слишком большой. Максимальный размер: ${MAX_FILE_SIZE / 1024 / 1024}MB`
          )
        }

        audioBuffer = fs.readFileSync(filePath)
        console.log('✅ Файл успешно прочитан [File read successfully]')
      } else {
        console.log('🌐 Получение файла по URL [Getting file from URL]')
        // Получаем файл по URL
        const audioResponse = await fetch(fileUrl)
        console.log('📡 Статус ответа:', audioResponse.status)
        if (!audioResponse.ok) {
          console.error('❌ Ошибка получения файла:', audioResponse.statusText)
          throw new Error('Ошибка получения аудио файла')
        }

        // Определяем формат файла из URL
        const url = new URL(fileUrl)
        const pathname = url.pathname.toLowerCase()
        console.log('🔍 Анализ URL:', { pathname })

        if (pathname.includes('.oga')) {
          fileExtension = 'oga'
        } else if (pathname.includes('.ogg')) {
          fileExtension = 'ogg'
        } else {
          const contentType = audioResponse.headers.get('content-type')
          console.log('📄 Content-Type:', contentType)
          if (!contentType) {
            console.error('❌ Не удалось определить тип файла')
            throw new Error('Не удалось определить тип файла')
          }
          fileExtension = contentType.split('/')[1].toLowerCase()
        }
        console.log('📄 Определенное расширение файла:', fileExtension)

        if (!SUPPORTED_FORMATS.includes(fileExtension)) {
          console.error('❌ Неподдерживаемый формат файла:', fileExtension)
          throw new Error(
            `Неподдерживаемый формат файла. Поддерживаемые форматы: ${SUPPORTED_FORMATS.join(', ')}`
          )
        }

        const contentLength = audioResponse.headers.get('content-length')
        console.log('📊 Размер файла:', contentLength)
        if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
          console.error('❌ Файл слишком большой:', contentLength)
          throw new Error(
            `Файл слишком большой. Максимальный размер: ${MAX_FILE_SIZE / 1024 / 1024}MB`
          )
        }

        audioBuffer = Buffer.from(await audioResponse.arrayBuffer())
        console.log('✅ Файл успешно загружен [File downloaded successfully]')
      }

      // Инициализируем OpenAI
      console.log('🔑 Инициализация OpenAI [Initializing OpenAI]')
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      })

      // Отправляем аудио в Whisper API
      console.log('🎤 Отправка в Whisper API [Sending to Whisper API]')
      console.log('📄 Используемое расширение файла:', fileExtension)
      const transcription = await openai.audio.transcriptions.create({
        file: await toFile(audioBuffer, `audio.${fileExtension}`),
        model: 'whisper-1',
        language: is_ru ? 'ru' : 'en',
      })

      console.log('📝 Распознанный текст:', transcription.text)

      // Формируем системный промпт
      const systemPrompt = is_ru
        ? 'Ты - дружелюбный ассистент. Отвечай на сообщения пользователя естественно и дружелюбно.'
        : 'You are a friendly assistant. Respond to user messages naturally and friendly.'

      // Получаем ответ от GPT
      console.log('🤖 Получение ответа от GPT [Getting GPT response]')
      const gptResponse = await answerAi(
        user.model,
        user,
        transcription.text,
        is_ru ? 'ru' : 'en',
        systemPrompt
      )

      if (gptResponse) {
        // Отправляем ответ пользователю
        console.log(
          '📤 Подготовка к отправке сообщения... [Preparing to send message]'
        )
        console.log('📝 Текст ответа:', gptResponse)

        try {
          // Получаем бота по имени
          const botResult = getBotByName(bot_name)
          if (!botResult?.bot) {
            throw new Error(`Bot ${bot_name} not found`)
          }
          const { bot } = botResult

          // Отправляем индикатор набора текста
          await bot.telegram.sendChatAction(Number(telegram_id), 'typing')

          // Отправляем сообщение напрямую через bot.telegram.sendMessage
          const result = await bot.telegram.sendMessage(
            Number(telegram_id),
            gptResponse,
            { parse_mode: 'HTML' }
          )
          console.log('✅ Сообщение успешно отправлено:', result)
        } catch (error) {
          console.error('❌ Ошибка при отправке сообщения:', error)
          throw error
        }

        return { success: true }
      }

      return { success: true }
    } catch (error) {
      console.error('❌ Ошибка обработки голосового сообщения:', error)

      // Отправляем сообщение об ошибке пользователю
      const errorMessage = is_ru
        ? 'Извините, произошла ошибка при обработке голосового сообщения. Пожалуйста, попробуйте еще раз.'
        : 'Sorry, an error occurred while processing your voice message. Please try again.'

      await sendSafeFormattedMessage(
        {
          from: {
            id: Number(telegram_id),
            username: username,
            language_code: is_ru ? 'ru' : 'en',
          },
          message: {
            text: '',
            chat: {
              id: Number(telegram_id),
            },
          },
          reply: async (text: string, options?: any) => {
            console.log('📤 Отправка сообщения об ошибке:', {
              chatId: telegram_id,
              text,
              options,
            })
            return { message_id: Date.now() }
          },
        } as unknown as Context<Update>,
        errorMessage
      )

      throw error
    }
  }
)
