import { inngest } from '@/inngest-functions/clients'
import { getBotByName } from '@/core/bot'
import { logger } from '@/utils/logger'
import axios from 'axios'
import { TransactionType } from '@/interfaces/payments.interface'
import { errorMessage, errorMessageAdmin } from '@/helpers'
import { v4 as uuidv4 } from 'uuid'
import { ModeEnum } from '@/interfaces/modes'
import { getUserBalance } from '@/core/supabase'

if (!process.env.ELESTIO_URL) {
  throw new Error('ELESTIO_URL is not set')
}

export const imageToPromptFunction = inngest.createFunction(
  {
    id: 'image-to-prompt-generation',
    name: 'image-to-prompt',
    retries: 3,
  },
  { event: 'image/to-prompt.generate' },
  async ({ event, step }) => {
    try {
      const { image, telegram_id, username, is_ru, bot_name, cost_per_image } =
        event.data

      logger.info('🚀 Начало анализа изображения', {
        description: 'Starting image analysis',
        telegram_id,
        username,
        is_ru,
        bot_name,
      })

      // Получаем бота для отправки сообщений
      const { bot } = getBotByName(bot_name)

      // Проверяем баланс и обрабатываем платеж
      const balanceCheck = await step.run('process-payment', async () => {
        logger.info('💰 Обработка платежа', {
          description: 'Processing payment',
          telegram_id,
          cost_per_image,
          bot_name,
        })

        // Генерируем уникальный ID для операции
        const payment_operation_id = `image-to-prompt-${telegram_id}-${Date.now()}-${uuidv4()}`

        // Отправляем событие в централизованный процессор платежей
        await inngest.send({
          id: payment_operation_id,
          name: 'payment/process',
          data: {
            telegram_id,
            amount: cost_per_image,
            is_ru,
            bot_name,
            type: TransactionType.MONEY_EXPENSE,
            description: 'Payment for image to prompt conversion',
            operation_id: payment_operation_id,
            service_type: ModeEnum.ImageToPrompt,
            metadata: {
              service_type: ModeEnum.ImageToPrompt,
              image_url: image,
            },
          },
        })

        logger.info('💸 Платеж отправлен на обработку', {
          description: 'Payment sent for processing',
          telegram_id,
          payment_operation_id,
          amount: cost_per_image,
        })

        // Даем время на обработку платежа
        await new Promise(resolve => setTimeout(resolve, 500))

        // Получаем актуальный баланс из базы данных
        const newBalance = await getUserBalance(telegram_id, bot_name)

        return {
          success: true,
          paymentAmount: cost_per_image,
          newBalance: Number(newBalance) || 0,
        }
      })

      if (!balanceCheck.success) {
        throw new Error('Not enough stars')
      }

      // Отправляем сообщение о начале обработки
      await step.run('send-start-message', async () => {
        if (!bot) {
          throw new Error('Bot instance not found')
        }
        await bot.telegram.sendMessage(
          telegram_id,
          is_ru ? '⏳ Генерация промпта...' : '⏳ Generating prompt...'
        )
      })

      // Отправляем запрос к API через Inngest
      const initResponse = await step.run('init-api-request', async () => {
        logger.info('🔍 Отправка запроса на анализ изображения', {
          description: 'Sending request for image analysis',
          telegram_id,
          image_url: image,
        })

        try {
          const response = await axios.post(
            'https://fancyfeast-joy-caption-alpha-two.hf.space/call/stream_chat',
            {
              data: [
                { path: image },
                'Descriptive',
                'long',
                [
                  'Describe the image in detail, including colors, style, mood, and composition.',
                ],
                '',
                '',
              ],
            },
            {
              headers: {
                'Content-Type': 'application/json',
              },
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
            }
          )

          logger.info('✅ Получен ответ от API', {
            description: 'Received response from API',
            telegram_id,
            event_id: response.data?.event_id || response.data,
          })

          return response
        } catch (error) {
          logger.error('❌ Ошибка при отправке запроса к API', {
            description: 'Error sending request to API',
            telegram_id,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          })
          throw error
        }
      })

      const eventId = initResponse.data?.event_id || initResponse.data
      if (!eventId) {
        logger.error('❌ Отсутствует ID события в ответе', {
          description: 'No event ID in response',
          telegram_id,
          response_data: initResponse.data,
        })
        throw new Error('No event ID in response')
      }

      // Получаем результат
      const resultResponse = await step.run('get-result', async () => {
        logger.info('⏳ Ожидание результата анализа', {
          description: 'Waiting for analysis result',
          telegram_id,
          event_id: eventId,
        })

        try {
          const response = await axios.get(
            `https://fancyfeast-joy-caption-alpha-two.hf.space/call/stream_chat/${eventId}`,
            {
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
            }
          )

          logger.info('✅ Получен результат анализа', {
            description: 'Received analysis result',
            telegram_id,
            event_id: eventId,
            has_data: !!response.data,
          })

          return response
        } catch (error) {
          logger.error('❌ Ошибка при получении результата', {
            description: 'Error getting analysis result',
            telegram_id,
            event_id: eventId,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          })
          throw error
        }
      })

      if (!resultResponse.data) {
        logger.error('❌ Отсутствуют данные в ответе', {
          description: 'No data in response',
          telegram_id,
          event_id: eventId,
        })
        throw new Error('Image to prompt: No data in response')
      }

      const responseText = resultResponse.data as string
      const lines = responseText.split('\n')

      logger.info('📝 Обработка результата', {
        description: 'Processing analysis result',
        telegram_id,
        lines_count: lines.length,
      })

      // Обрабатываем результат
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (Array.isArray(data) && data.length > 1) {
              const caption = data[1]

              logger.info('✅ Найден валидный промпт', {
                description: 'Found valid prompt',
                telegram_id,
                caption_length: caption.length,
              })

              // Отправляем результат пользователю
              await step.run('send-result', async () => {
                try {
                  if (!bot) {
                    throw new Error('Bot instance not found')
                  }
                  await bot.telegram.sendMessage(
                    telegram_id,
                    '```\n' + caption + '\n```',
                    {
                      parse_mode: 'MarkdownV2',
                    }
                  )
                  logger.info('✅ Результат отправлен пользователю', {
                    description: 'Result sent to user',
                    telegram_id,
                  })
                } catch (error) {
                  logger.error('❌ Ошибка при отправке результата', {
                    description: 'Error sending result to user',
                    telegram_id,
                    error:
                      error instanceof Error ? error.message : 'Unknown error',
                  })
                  throw error
                }
              })

              return { success: true, caption }
            }
          } catch (e) {
            logger.error('❌ Ошибка при парсинге JSON', {
              description: 'Error parsing JSON from line',
              telegram_id,
              line,
              error: e instanceof Error ? e.message : 'Unknown error',
            })
          }
        }
      }

      logger.error('❌ Не найден валидный промпт в ответе', {
        description: 'No valid prompt found in response',
        telegram_id,
        response_text: responseText,
      })
      throw new Error('No valid caption found in response')
    } catch (error) {
      logger.error('❌ Ошибка при анализе изображения', {
        description: 'Error during image analysis',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      })

      // Отправляем сообщение об ошибке пользователю
      if (event.data.telegram_id) {
        await errorMessage(
          error as Error,
          event.data.telegram_id,
          event.data.is_ru
        )
      }

      // Отправляем сообщение об ошибке администратору
      await errorMessageAdmin(error as Error)

      throw error
    }
  }
)
