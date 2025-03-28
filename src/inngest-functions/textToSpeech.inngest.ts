import { inngest } from '@/core/inngest/clients'
import { getBotByName } from '@/core/bot'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { errorMessage, errorMessageAdmin } from '@/helpers'
import { createWriteStream } from 'fs'
import path from 'path'
import os from 'os'
import { elevenlabs } from '@/core/elevenlabs'
import { InputFile } from 'telegraf/typings/core/types/typegram'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { sendBalanceMessage } from '@/price/helpers'
import { v4 as uuidv4 } from 'uuid'

interface TextToSpeechEvent {
  data: {
    text: string
    voice_id: string
    telegram_id: string
    is_ru: boolean
    bot_name: string
    username?: string
  }
}

type SpeechResult =
  | { success: true; audioUrl: string }
  | { success: false; error: Error }

export const textToSpeechFunction = inngest.createFunction(
  {
    name: 'text-to-speech-generation',
    id: 'text-to-speech',
    concurrency: { limit: 5 },
    retries: 2,
  },
  { event: 'text-to-speech.requested' },
  async ({ event, step }: any) => {
    let validatedParams: TextToSpeechEvent['data'] | null = null
    try {
      validatedParams = (await step.run('validate-input', () => {
        if (
          !event.data ||
          !event.data.text ||
          !event.data.voice_id ||
          !event.data.telegram_id ||
          event.data.is_ru === undefined ||
          !event.data.bot_name
        ) {
          throw new Error('Missing required fields')
        }

        const validData: TextToSpeechEvent['data'] = {
          text: event.data.text,
          voice_id: event.data.voice_id,
          telegram_id: event.data.telegram_id,
          is_ru: event.data.is_ru,
          bot_name: event.data.bot_name,
        }

        if (event.data.username) {
          validData.username = event.data.username
        }

        return validData
      })) as TextToSpeechEvent['data']

      await step.run('get-user-info', async () => {
        const user = await getUserByTelegramIdString(
          validatedParams.telegram_id
        )
        if (!user) throw new Error('User not found')
        if (user.level === 7) {
          await updateUserLevelPlusOne(user.telegram_id, user.level)
        }
        return user
      })

      // Обработка оплаты с помощью PaymentProcessor
      const paymentResult = await step.run('process-payment', async () => {
        // Отправляем событие 'payment/process' для обработки платежа
        return await inngest.send({
          id: `payment-${validatedParams.telegram_id}-${Date.now()}-${
            validatedParams.text.length
          }-${uuidv4()}`,
          name: 'payment/process',
          data: {
            telegram_id: validatedParams.telegram_id,
            mode: ModeEnum.TextToSpeech,
            is_ru: validatedParams.is_ru,
            bot_name: validatedParams.bot_name,
            description: `Payment for text to speech`,
            additional_info: {
              text_length: validatedParams.text.length,
            },
          },
        })
      })

      // Отправляем уведомление о начале генерации
      await step.run('send-generating-notification', async () => {
        const { bot } = getBotByName(validatedParams.bot_name)

        await bot.telegram.sendMessage(
          validatedParams.telegram_id,
          validatedParams.is_ru
            ? '⏳ Генерация аудио...'
            : '⏳ Generating audio...'
        )

        return { sent: true }
      })

      // Генерируем речь с использованием ElevenLabs API
      const speechResult = (await step.run('generate-speech', async () => {
        try {
          console.log('📣 Генерация речи:', {
            description: 'Generating speech',
            voice_id: validatedParams.voice_id,
            telegram_id: validatedParams.telegram_id,
            text_length: validatedParams.text.length,
          })

          // Проверяем наличие API ключа
          if (!process.env.ELEVENLABS_API_KEY) {
            throw new Error('ELEVENLABS_API_KEY отсутствует')
          }

          const audioStream = await elevenlabs.generate({
            voice: validatedParams.voice_id,
            model_id: 'eleven_turbo_v2_5',
            text: validatedParams.text,
          })

          const audioUrl = path.join(os.tmpdir(), `audio_${Date.now()}.mp3`)
          const writeStream = createWriteStream(audioUrl)

          return new Promise<SpeechResult>((resolve, reject) => {
            audioStream.pipe(writeStream)

            writeStream.on('finish', () => {
              console.log('✅ Аудио успешно сгенерировано:', {
                description: 'Audio successfully generated',
                audioUrl,
              })
              resolve({
                success: true,
                audioUrl,
              })
            })

            writeStream.on('error', error => {
              console.error('🔥 Ошибка при записи аудио файла:', {
                description: 'Error writing audio file',
                error: JSON.stringify(error, Object.getOwnPropertyNames(error)),
              })
              resolve({
                success: false,
                error:
                  error instanceof Error
                    ? error
                    : new Error(JSON.stringify(error)),
              })
            })
          })
        } catch (error) {
          console.error('🔥 Ошибка при генерации речи:', {
            description: 'Error generating speech',
            error: JSON.stringify(error, Object.getOwnPropertyNames(error)),
            stack: error instanceof Error ? error.stack : undefined,
          })

          return {
            success: false,
            error:
              error instanceof Error ? error : new Error(JSON.stringify(error)),
          }
        }
      })) as SpeechResult

      if (!speechResult.success) {
        const typedResult = speechResult as { success: false; error: Error }
        throw typedResult.error
      }

      // Отправляем аудио пользователю
      await step.run('send-audio', async () => {
        const { bot } = getBotByName(validatedParams.bot_name)

        await bot.telegram.sendAudio(
          validatedParams.telegram_id,
          { source: speechResult.audioUrl } as InputFile,
          {
            reply_markup: {
              keyboard: [
                [
                  {
                    text: validatedParams.is_ru
                      ? '🎙️ Текст в голос'
                      : '🎙️ Text to speech',
                  },
                  {
                    text: validatedParams.is_ru
                      ? '🏠 Главное меню'
                      : '🏠 Main menu',
                  },
                ],
              ],
              resize_keyboard: true,
            },
          }
        )

        // Отправляем сообщение о балансе после оплаты
        const paymentData = paymentResult?.data
        if (
          paymentData?.newBalance !== undefined &&
          paymentData?.amount !== undefined
        ) {
          await sendBalanceMessage(
            validatedParams.telegram_id,
            paymentData.newBalance,
            paymentData.amount,
            validatedParams.is_ru,
            bot
          )
        }

        return { sent: true }
      })

      return { success: true, audioUrl: speechResult.audioUrl }
    } catch (error) {
      await step.run('error-handler', async () => {
        console.error('🔥 Глобальная ошибка при генерации речи:', {
          description: 'Global error in speech generation',
          error: JSON.stringify(error, Object.getOwnPropertyNames(error)),
        })

        if (validatedParams) {
          // Отправляем сообщение об ошибке пользователю
          errorMessage(
            error as Error,
            validatedParams.telegram_id,
            validatedParams.is_ru
          )

          // Отправляем сообщение об ошибке администратору
          errorMessageAdmin(error as Error)

          // Отправляем уведомление пользователю об ошибке
          const { bot } = getBotByName(validatedParams.bot_name)
          await bot.telegram.sendMessage(
            validatedParams.telegram_id,
            validatedParams.is_ru
              ? '❌ Произошла ошибка при генерации аудио. Пожалуйста, попробуйте еще раз.'
              : '❌ An error occurred while generating audio. Please try again.'
          )
        }
      })

      throw error
    }
  }
)
