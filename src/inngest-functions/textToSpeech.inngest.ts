import { TelegramId } from '@/interfaces/telegram.interface'
import { inngest } from '@/inngest-functions/clients'
import { getBotByName } from '@/core/bot'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { errorMessage, errorMessageAdmin } from '@/helpers'
import { InputFile } from 'telegraf/typings/core/types/typegram'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { sendBalanceMessage } from '@/price/helpers'
import { v4 as uuidv4 } from 'uuid'
import { elevenlabs } from '@/core/elevenlabs'
import { calculateModeCost } from '@/price/helpers/modelsCost'

import { createWriteStream } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { Telegram } from 'telegraf'
interface TextToSpeechEvent {
  data: {
    text: string
    voice_id: string
    telegram_id: TelegramId
    is_ru: boolean
    bot_name: string
    username?: string
  }
}

interface BufferLike {
  data: number[]
  type: string
}

type SpeechResult =
  | { success: true; audioBuffer: Buffer | BufferLike }
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

      if (!validatedParams) {
        throw new Error('Validation failed - missing required parameters')
      }

      const params = validatedParams // Создаем константу для использования в блоке try

      await step.run('get-user-info', async () => {
        const user = await getUserByTelegramIdString(params.telegram_id)
        if (!user) throw new Error('User not found')
        if (user.level === 7) {
          await updateUserLevelPlusOne(user.telegram_id, user.level)
        }
        return user
      })

      // Отправляем уведомление о начале генерации
      await step.run('send-generating-notification', async () => {
        const botResult = getBotByName(params.bot_name)
        if (!botResult?.bot) {
          throw new Error(`Bot ${params.bot_name} not found`)
        }
        const { bot } = botResult

        await bot.telegram.sendMessage(
          params.telegram_id,
          params.is_ru ? '⏳ Генерация аудио...' : '⏳ Generating audio...'
        )

        return { sent: true }
      })

      // Генерируем речь с использованием ElevenLabs API
      const speechResult = (await step.run('generate-speech', async () => {
        try {
          console.log('📣 Генерация речи:', {
            description: 'Generating speech',
            voice_id: params.voice_id,
            telegram_id: params.telegram_id,
            text_length: params.text.length,
          })

          // Проверяем наличие API ключа
          if (!process.env.ELEVENLABS_API_KEY) {
            throw new Error('ELEVENLABS_API_KEY отсутствует')
          }

          console.log('🎯 Запрос к ElevenLabs API:', {
            description: 'Making request to ElevenLabs API',
            voice_id: params.voice_id,
            model: 'eleven_turbo_v2_5',
            text_length: params.text.length,
          })

          const audioStream = await elevenlabs.generate({
            voice: params.voice_id,
            model_id: 'eleven_turbo_v2_5',
            text: params.text,
          })

          console.log('✅ Получен ответ от ElevenLabs API:', {
            description: 'Received response from ElevenLabs API',
            stream_received: !!audioStream,
          })

          return new Promise<SpeechResult>((resolve, reject) => {
            if (!audioStream) {
              reject(new Error('Audio stream is null'))
              return
            }

            const audioUrl = path.join(os.tmpdir(), `audio_${Date.now()}.mp3`)
            const writeStream = createWriteStream(audioUrl)

            console.log('📝 Создание временного файла:', {
              description: 'Creating temporary file',
              path: audioUrl,
            })

            audioStream.pipe(writeStream)

            writeStream.on('error', error => {
              console.error('🔥 Ошибка записи файла:', {
                description: 'File write error',
                error: error.message,
                path: audioUrl,
              })
              reject(error)
            })

            writeStream.on('finish', () => {
              try {
                console.log('✅ Аудио файл создан:', {
                  description: 'Audio file created',
                  path: audioUrl,
                })

                // Читаем файл в буфер для отправки
                const audioBuffer = require('fs').readFileSync(audioUrl)

                console.log('📦 Аудио буфер создан:', {
                  description: 'Audio buffer created',
                  buffer_size: audioBuffer.length,
                  buffer_type: typeof audioBuffer,
                  is_buffer: Buffer.isBuffer(audioBuffer),
                })

                // Проверяем, что у нас действительно есть буфер
                if (!Buffer.isBuffer(audioBuffer)) {
                  throw new Error('Invalid audio buffer type')
                }

                // Удаляем временный файл
                require('fs').unlinkSync(audioUrl)

                resolve({
                  success: true,
                  audioBuffer,
                })
              } catch (error) {
                console.error('🔥 Ошибка при обработке аудио файла:', {
                  description: 'Error processing audio file',
                  error: error instanceof Error ? error.message : String(error),
                  stack: error instanceof Error ? error.stack : undefined,
                })
                reject(error)
              }
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

      // Обработка оплаты с помощью PaymentProcessor
      const paymentResult = await step.run('process-payment', async () => {
        const eventId = `payment-${params.telegram_id}-${Date.now()}-${
          params.text.length
        }-${uuidv4()}`

        console.log('💰 Отправка платежа на обработку:', {
          description: 'Sending payment for processing',
          eventId,
          telegram_id: params.telegram_id,
          amount: calculateModeCost({ mode: ModeEnum.TextToSpeech }).stars,
        })

        // Отправляем событие 'payment/process' для обработки платежа
        await inngest.send({
          id: eventId,
          name: 'payment/process',
          data: {
            telegram_id: params.telegram_id,
            amount: calculateModeCost({ mode: ModeEnum.TextToSpeech }).stars,
            type: 'money_expense',
            description: 'Payment for text to speech conversion',
            bot_name: params.bot_name,
            metadata: {
              service_type: ModeEnum.TextToSpeech,
              text_preview: params.text.substring(0, 50),
            },
          },
        })
      })

      // Отправляем аудио пользователю
      await step.run('send-audio', async () => {
        const botResult = getBotByName(params.bot_name)
        if (!botResult?.bot) {
          throw new Error(`Bot ${params.bot_name} not found`)
        }
        const { bot } = botResult

        if (!speechResult?.audioBuffer) {
          console.error('❌ Отсутствует аудио буфер:', {
            description: 'Audio buffer is missing',
            speechResult,
          })
          throw new Error('Audio buffer is missing')
        }

        console.log('📤 Подготовка к отправке аудио:', {
          description: 'Preparing to send audio',
          buffer_type: typeof speechResult.audioBuffer,
          is_buffer: Buffer.isBuffer(speechResult.audioBuffer),
          has_data: 'data' in speechResult.audioBuffer,
          buffer_size: Buffer.isBuffer(speechResult.audioBuffer)
            ? speechResult.audioBuffer.length
            : (speechResult.audioBuffer as BufferLike).data.length,
        })

        // Создаем правильный Buffer из данных
        const audioBuffer = Buffer.isBuffer(speechResult.audioBuffer)
          ? speechResult.audioBuffer
          : Buffer.from((speechResult.audioBuffer as BufferLike).data)

        console.log('📦 Преобразованный буфер:', {
          description: 'Converted buffer',
          buffer_size: audioBuffer.length,
          is_buffer: Buffer.isBuffer(audioBuffer),
        })

        // Создаем временный файл
        const tempFilePath = path.join(os.tmpdir(), `voice_${Date.now()}.mp3`)

        try {
          require('fs').writeFileSync(tempFilePath, audioBuffer)

          console.log('💾 Временный файл создан:', {
            description: 'Temporary file created',
            path: tempFilePath,
            size: require('fs').statSync(tempFilePath).size,
          })

          const fileStats = require('fs').statSync(tempFilePath)
          console.log('📊 Статистика файла:', {
            description: 'File statistics',
            size: fileStats.size,
            path: tempFilePath,
          })

          await bot.telegram.sendAudio(
            params.telegram_id,
            {
              source: tempFilePath,
              filename: `voice_${Date.now()}.mp3`,
            } as InputFile,
            {
              caption: params.is_ru
                ? 'Ваше аудио готово 🎵'
                : 'Your audio is ready 🎵',
              reply_markup: {
                keyboard: [
                  [
                    {
                      text: params.is_ru
                        ? '🎙️ Текст в голос'
                        : '🎙️ Text to speech',
                    },
                    {
                      text: params.is_ru ? '🏠 Главное меню' : '🏠 Main menu',
                    },
                  ],
                ],
                resize_keyboard: true,
              },
            }
          )

          console.log('✅ Аудио успешно отправлено:', {
            description: 'Audio successfully sent',
            telegram_id: params.telegram_id,
          })
        } catch (error) {
          console.error('❌ Ошибка при работе с аудио:', {
            description: 'Error processing audio',
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          })
          throw error
        } finally {
          // Удаляем временный файл
          try {
            if (require('fs').existsSync(tempFilePath)) {
              require('fs').unlinkSync(tempFilePath)
              console.log('🗑️ Временный файл удален:', {
                description: 'Temporary file deleted',
                path: tempFilePath,
              })
            }
          } catch (error) {
            console.error('⚠️ Ошибка при удалении временного файла:', {
              description: 'Error deleting temporary file',
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }

        // Отправляем сообщение о балансе после оплаты
        const paymentData = paymentResult?.data

        if (
          paymentData?.newBalance !== undefined &&
          paymentData?.amount !== undefined
        ) {
          await sendBalanceMessage(
            params.telegram_id,
            paymentData.newBalance,
            paymentData.amount,
            params.is_ru,
            bot as unknown as Telegram
          )
        }

        return { sent: true }
      })

      return { success: true, audioBuffer: speechResult.audioBuffer }
    } catch (error) {
      await step.run('error-handler', async () => {
        console.error('🔥 Глобальная ошибка при генерации речи:', {
          description: 'Global error in speech generation',
          error: JSON.stringify(error, Object.getOwnPropertyNames(error)),
        })

        if (validatedParams) {
          // Отправляем событие для возврата средств
          const refundEventId = `refund-${
            validatedParams.telegram_id
          }-${Date.now()}-${uuidv4()}`

          console.log('💰 Отправка запроса на возврат средств:', {
            description: 'Sending refund request',
            eventId: refundEventId,
            telegram_id: validatedParams.telegram_id,
            amount: calculateModeCost({ mode: ModeEnum.TextToSpeech }).stars,
          })

          await inngest.send({
            id: refundEventId,
            name: 'payment/refund',
            data: {
              telegram_id: validatedParams.telegram_id,
              mode: ModeEnum.TextToSpeech,
              is_ru: validatedParams.is_ru,
              bot_name: validatedParams.bot_name,
              description: `Refund for failed text to speech generation`,
              type: 'money_income',
              amount: calculateModeCost({ mode: ModeEnum.TextToSpeech }).stars,
              metadata: {
                service_type: ModeEnum.TextToSpeech,
                text_length: validatedParams.text.length,
                error: error instanceof Error ? error.message : String(error),
              },
            },
          })

          // Отправляем сообщение об ошибке пользователю
          errorMessage(
            error as Error,
            validatedParams.telegram_id,
            validatedParams.is_ru
          )

          // Отправляем сообщение об ошибке администратору
          errorMessageAdmin(error as Error)

          // Отправляем уведомление пользователю об ошибке и возврате средств
          const botResult = getBotByName(validatedParams.bot_name)
          if (!botResult?.bot) {
            throw new Error(`Bot ${validatedParams.bot_name} not found`)
          }
          const { bot } = botResult

          await bot.telegram.sendMessage(
            validatedParams.telegram_id,
            validatedParams.is_ru
              ? '❌ Произошла ошибка при генерации аудио. Средства были возвращены на ваш баланс. Пожалуйста, попробуйте еще раз.'
              : '❌ An error occurred while generating audio. The funds have been returned to your balance. Please try again.'
          )
        }
      })

      throw error
    }
  }
)
