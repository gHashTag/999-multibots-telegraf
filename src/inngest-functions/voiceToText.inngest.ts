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

export const voiceToTextProcessor = inngest.createFunction(
  { 
    id: 'voice-to-text-processor',
    name: 'voice-to-text.requested' 
  },
  { event: 'voice-to-text.requested' },
  async ({ event }) => {
    console.log('🚀 Начало обработки голосового сообщения [Starting voice message processing]')
    const { fileUrl, telegram_id, is_ru, bot_name, username } = event.data

    try {
      // Получаем пользователя
      const user = await getUserByTelegramIdString(telegram_id)
      if (!user) {
        throw new Error('Пользователь не найден')
      }

      // Получаем аудио файл
      console.log('🎵 Получение аудио файла [Getting audio file]')
      const audioResponse = await fetch(fileUrl)
      if (!audioResponse.ok) {
        throw new Error('Ошибка получения аудио файла')
      }

      // Инициализируем OpenAI
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      })

      // Отправляем аудио в Whisper API
      console.log('🎤 Отправка в Whisper API [Sending to Whisper API]')
      const transcription = await openai.audio.transcriptions.create({
        file: await toFile(audioResponse, 'audio.ogg'),
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
        // Создаем контекст для отправки сообщения
        const ctx = {
          from: {
            id: Number(telegram_id),
            username: username,
            language_code: is_ru ? 'ru' : 'en'
          },
          message: {
            text: transcription.text,
            chat: {
              id: Number(telegram_id)
            }
          },
          reply: async (text: string, options?: any) => {
            console.log('📤 Отправка сообщения:', { chatId: telegram_id, text, options })
            return { message_id: Date.now() }
          },
          telegram: {
            sendChatAction: async (chatId: number, action: string) => {
              console.log('🔄 Отправка действия:', { chatId, action })
            }
          }
        } as unknown as Context<Update>

        // Отправляем ответ пользователю
        await sendSafeFormattedMessage(ctx, gptResponse)

        console.log('✅ Ответ отправлен пользователю [Response sent to user]')
      }

      return { success: true }
    } catch (error) {
      console.error('❌ Ошибка обработки голосового сообщения:', error)
      
      // Создаем контекст для отправки сообщения об ошибке
      const ctx = {
        from: {
          id: Number(telegram_id),
          username: username,
          language_code: is_ru ? 'ru' : 'en'
        },
        message: {
          text: '',
          chat: {
            id: Number(telegram_id)
          }
        },
        reply: async (text: string, options?: any) => {
          console.log('📤 Отправка сообщения:', { chatId: telegram_id, text, options })
          return { message_id: Date.now() }
        },
        telegram: {
          sendChatAction: async (chatId: number, action: string) => {
            console.log('🔄 Отправка действия:', { chatId, action })
          }
        }
      } as unknown as Context<Update>

      // Отправляем сообщение об ошибке пользователю
      await sendSafeFormattedMessage(
        ctx,
        is_ru
          ? 'Произошла ошибка при обработке голосового сообщения. Пожалуйста, попробуйте позже.'
          : 'An error occurred while processing your voice message. Please try again later.'
      )

      throw error
    }
  }
) 