import { inngest } from './clients'
import { OpenAI, toFile } from 'openai'
import { logger } from '../lib/logger'
import { getBotByName } from '@/core/bot'
import { getUserByTelegramIdString } from '@/core/supabase'
import {
  TranscriptionResult,
  TranscriptionSettings,
  AudioProcessingCompletedEvent,
} from '@/scenes/audioToTextScene/types'
import fetch from 'node-fetch'
import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import axios from 'axios'
import { TranscriptionLanguages } from '@/scenes/audioToTextScene/constants'
import { Response } from 'node-fetch'
import { AUDIO_TRANSCRIPTION_EVENT } from '../scenes/audioToTextScene/constants'
import { getBotByName as getBot } from '../helpers/bot-helpers'
import { formatTranscriptionResult } from '../helpers'
import FormData from 'form-data'
import os from 'os'

// Максимальный размер файла для транскрипции
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB

// Поддерживаемые форматы аудио
const SUPPORTED_FORMATS = [
  'mp3',
  'mp4',
  'mpeg',
  'mpga',
  'ogg',
  'oga',
  'wav',
  'webm',
  'm4a',
]

// Тип для данных события
interface AudioTranscriptionEventData {
  userId: number
  chatId: number
  fileId: string
  messageId: number
  settings?: {
    language?: string
    model?: string
  }
}

// Тип для ответа от OpenAI API
interface TranscriptionResponse {
  text: string
  language?: string
}

// Тип для данных события и ответа от функции
interface InngestEvent {
  name: string
  data: AudioTranscriptionEventData
}

interface InngestStep {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>
}

interface InngestLogger {
  info: (message: string, data?: any) => void
  error: (message: string, data?: any) => void
}

/**
 * Обработчик для транскрипции аудио файлов
 */
export const audioTranscriptionProcessor = inngest.createFunction(
  { id: 'audio-transcription-processor' },
  { event: AUDIO_TRANSCRIPTION_EVENT },
  async ({
    event,
    step,
    logger: inngestLogger,
  }: {
    event: InngestEvent
    step: InngestStep
    logger: InngestLogger
  }) => {
    inngestLogger.info('Starting audio transcription processing', { event })

    try {
      const {
        userId,
        chatId,
        fileId,
        messageId,
        settings = {},
      } = event.data as AudioTranscriptionEventData

      // Получаем бота
      const botInstance = getBot('default')
      if (!botInstance) {
        throw new Error('Bot instance not found')
      }
      const bot = botInstance.bot

      // Получаем пользователя
      const user = await step.run('Get user', async () => {
        try {
          // Здесь должна быть логика получения пользователя из БД
          // Заглушка для примера
          return { id: userId, name: 'User' }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          throw new Error(`Failed to get user: ${errorMessage}`)
        }
      })

      if (!user) {
        throw new Error(`User with ID ${userId} not found`)
      }

      // Получаем файл
      const fileInfo = await step.run('Get file info', async () => {
        try {
          return await bot.telegram.getFile(fileId)
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          throw new Error(`Failed to get file info: ${errorMessage}`)
        }
      })

      if (!fileInfo || !fileInfo.file_path) {
        throw new Error('File not found or file_path is missing')
      }

      // Проверяем формат файла
      const fileExtension = path
        .extname(fileInfo.file_path)
        .slice(1)
        .toLowerCase()
      if (!SUPPORTED_FORMATS.includes(fileExtension)) {
        await bot.telegram.sendMessage(
          chatId,
          `Неподдерживаемый формат файла: ${fileExtension}. Поддерживаемые форматы: ${SUPPORTED_FORMATS.join(', ')}`
        )
        return { success: false, error: 'Unsupported file format' }
      }

      // Получаем файл
      const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`
      const fileResponse = await fetch(fileUrl)
      if (!fileResponse.ok) {
        throw new Error(
          `Failed to download file: ${fileResponse.status} ${fileResponse.statusText}`
        )
      }

      // Проверяем размер файла
      const contentLength = parseInt(
        fileResponse.headers.get('content-length') || '0',
        10
      )
      if (contentLength > MAX_FILE_SIZE) {
        await bot.telegram.sendMessage(
          chatId,
          `Файл слишком большой. Максимальный размер: ${MAX_FILE_SIZE / (1024 * 1024)} МБ`
        )
        return { success: false, error: 'File too large' }
      }

      // Сохраняем файл локально
      const tempFilePath = path.join(
        os.tmpdir(),
        `audio_${Date.now()}.${fileExtension}`
      )
      const fileBuffer = await fileResponse.buffer()
      fs.writeFileSync(tempFilePath, fileBuffer)

      // Отправляем сообщение о начале обработки
      await bot.telegram.sendMessage(chatId, 'Начинаю транскрипцию аудио...')

      // Транскрибируем аудио через OpenAI Whisper API
      const transcription = await step.run('Transcribe audio', async () => {
        try {
          const formData = new FormData()
          formData.append('file', fs.createReadStream(tempFilePath))
          formData.append('model', settings.model || 'whisper-1')

          if (settings.language) {
            formData.append('language', settings.language)
          }

          // можно добавить и другие параметры, например:
          // formData.append('prompt', 'Transcript of a conversation:')
          // formData.append('response_format', 'verbose_json')

          const response = await fetch(
            'https://api.openai.com/v1/audio/transcriptions',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              },
              body: formData,
            }
          )

          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`OpenAI API error: ${response.status} ${errorText}`)
          }

          return (await response.json()) as TranscriptionResponse
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          throw new Error(`Failed to transcribe audio: ${errorMessage}`)
        } finally {
          // Удаляем временный файл
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath)
          }
        }
      })

      // Отправляем результат
      await bot.telegram.sendMessage(
        chatId,
        formatTranscriptionResult(transcription),
        {
          parse_mode: 'HTML',
        }
      )

      logger.info('Audio transcription completed successfully', {
        userId,
        chatId,
        messageId,
        fileId,
      })

      return { success: true, transcription: transcription.text }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger.error('Error processing audio transcription', {
        error: errorMessage,
      })

      return { success: false, error: errorMessage }
    }
  }
)
