import { Request, Response } from 'express'
import { updatePrompt, getTaskData, getUserByTaskId } from '@/core/supabase/'
import { pulseNeuroImageV2, saveFileLocally } from '@/helpers'
import { API_URL } from '@/config'
import { getBotByName } from '@/core/bot'
import { errorMessageAdmin } from '@/helpers'
import fs from 'fs'
import path from 'path'
import { logger } from '@/utils/logger'

// Множество для хранения обработанных задач, чтобы избежать дублирования
const processedTaskIds = new Set<string>()

/**
 * Обработчик вебхука от нейрофото-сервиса
 */
export const handleWebhookNeurophoto = async (req: Request, res: Response) => {
  // Получаем данные из запроса
  const { task_id, status, result } = req.body

  try {
    // Логируем входящий вебхук
    logger.info({
      message: '🛰 Входящий вебхук от нейрофото',
      description: 'Incoming webhook from neurophoto service',
      task_id,
      status,
    })

    // Проверяем, был ли уже обработан этот task_id
    if (processedTaskIds.has(task_id)) {
      logger.info({
        message: '⚠️ Вебхук уже был обработан',
        description: 'Webhook already processed',
        task_id,
      })
      return res
        .status(200)
        .json({ message: `Webhook already processed for task_id: ${task_id}` })
    }

    // Статус "processing" обрабатываем отдельно - просто логируем
    if (status === 'processing') {
      logger.info({
        message: '⏳ Задача в процессе обработки',
        description: 'Task is being processed',
        task_id,
      })
      return res
        .status(200)
        .json({ message: 'Webhook processed successfully: processing' })
    }

    // Пытаемся получить данные задачи
    let taskData
    try {
      logger.info({
        message: '🔍 Получение данных задачи',
        description: 'Fetching task data',
        task_id,
      })
      taskData = await getTaskData(task_id)
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при получении данных задачи',
        description: 'Failed to fetch task data',
        error: error.message,
        task_id,
        status,
      })
      // Продолжаем выполнение, чтобы обработать задачу даже при отсутствии данных
      // вместо прерывания с ошибкой
    }

    // Обработка случая модерации контента
    if (
      status === 'Content Moderated' ||
      status === 'GENERATED CONTENT MODERATED'
    ) {
      // Если у нас нет данных задачи, пытаемся получить telegram_id из таблицы промптов
      if (!taskData) {
        try {
          logger.info({
            message: '🔍 Поиск пользователя по ID задачи',
            description: 'Searching for user by task ID',
            task_id,
          })

          const userData = await getUserByTaskId(task_id)

          if (userData) {
            logger.info({
              message: '✅ Пользователь найден по ID задачи',
              description: 'User found by task ID',
              task_id,
              telegram_id: userData.telegram_id,
              bot_name: userData.bot_name,
            })

            const { bot } = getBotByName(userData.bot_name)
            const is_ru = userData.language_code === 'ru'

            if (bot) {
              try {
                await bot.telegram.sendMessage(
                  userData.telegram_id,
                  is_ru
                    ? `🚫 Содержимое отклонено модерацией. Попробуйте другой промпт или еще раз.`
                    : `🚫 Content rejected by moderation. Try another prompt or try again.`,
                  {
                    reply_markup: {
                      keyboard: [
                        [
                          { text: '1️⃣' },
                          { text: '2️⃣' },
                          { text: '3️⃣' },
                          { text: '4️⃣' },
                        ],
                        [
                          {
                            text: is_ru
                              ? '⬆️ Улучшить промпт'
                              : '⬆️ Improve prompt',
                          },
                          {
                            text: is_ru
                              ? '📐 Изменить размер'
                              : '📐 Change size',
                          },
                        ],
                        [{ text: is_ru ? '🏠 Главное меню' : '🏠 Main menu' }],
                      ],
                      resize_keyboard: true,
                      one_time_keyboard: false,
                    },
                  }
                )

                logger.info({
                  message: '📤 Уведомление о модерации отправлено',
                  description: 'Moderation notification sent',
                  task_id,
                  telegram_id: userData.telegram_id,
                })

                // Помечаем задачу как обработанную
                processedTaskIds.add(task_id)
                return res.status(200).json({
                  message:
                    'Webhook processed successfully: content moderated, notification sent',
                })
              } catch (sendError) {
                logger.error({
                  message: '❌ Ошибка при отправке уведомления о модерации',
                  description: 'Error sending moderation notification',
                  error: sendError.message,
                  task_id,
                  telegram_id: userData.telegram_id,
                })
              }
            } else {
              logger.error({
                message: '❌ Не удалось получить экземпляр бота',
                description: 'Failed to get bot instance',
                task_id,
                bot_name: userData.bot_name,
              })
            }
          } else {
            logger.warn({
              message: '⚠️ Пользователь не найден по ID задачи',
              description: 'User not found by task ID',
              task_id,
            })
          }
        } catch (userLookupError) {
          logger.error({
            message: '❌ Ошибка при поиске пользователя по ID задачи',
            description: 'Error looking up user by task ID',
            error: userLookupError.message,
            task_id,
          })
        }

        // Если не удалось найти пользователя или отправить сообщение,
        // все равно отмечаем задачу как обработанную и возвращаем успех
        logger.warn({
          message: '🚫 Контент не прошел модерацию, данные задачи не найдены',
          description: 'Content moderation without task data',
          task_id,
        })

        // Помечаем задачу как обработанную
        processedTaskIds.add(task_id)
        return res.status(200).json({
          message: 'Webhook processed successfully: content moderated',
        })
      }

      // Если у нас есть данные задачи, обрабатываем как обычно
      const { bot_name } = taskData
      const { bot } = getBotByName(bot_name)

      if (!bot) {
        logger.error({
          message: '❌ Не удалось получить экземпляр бота',
          description: 'Failed to get bot instance',
          bot_name,
          task_id,
        })

        // Помечаем задачу как обработанную
        processedTaskIds.add(task_id)
        return res.status(200).json({
          message: 'Webhook processed: content moderated, but bot not found',
        })
      }

      const { telegram_id, language_code } = await updatePrompt(
        task_id,
        result?.sample || ''
      )
      const is_ru = language_code === 'ru'

      logger.warn({
        message: '🚫 Контент не прошел модерацию',
        description: 'Content moderated',
        task_id,
        telegram_id,
      })

      try {
        await bot.telegram.sendMessage(
          telegram_id,
          is_ru
            ? `🚫 Содержимое отклонено модерацией. Попробуйте другой промпт или еще раз.`
            : `🚫 Content rejected by moderation. Try another prompt or try again.`,
          {
            reply_markup: {
              keyboard: [
                [
                  { text: '1️⃣' },
                  { text: '2️⃣' },
                  { text: '3️⃣' },
                  { text: '4️⃣' },
                ],
                [
                  { text: is_ru ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt' },
                  { text: is_ru ? '📐 Изменить размер' : '📐 Change size' },
                ],
                [{ text: is_ru ? '🏠 Главное меню' : '🏠 Main menu' }],
              ],
              resize_keyboard: true,
              one_time_keyboard: false,
            },
          }
        )

        logger.info({
          message: '📤 Уведомление о модерации отправлено',
          description: 'Moderation notification sent',
          task_id,
          telegram_id,
        })
      } catch (sendError) {
        logger.error({
          message: '❌ Ошибка при отправке уведомления о модерации',
          description: 'Error sending moderation notification',
          error: sendError.message,
          task_id,
          telegram_id,
        })
      }

      // Помечаем задачу как обработанную
      processedTaskIds.add(task_id)
      return res
        .status(200)
        .json({ message: 'Webhook processed successfully: content moderated' })
    }

    // Если данные задачи не найдены и статус SUCCESS, пытаемся продолжить с минимальными данными
    if (!taskData && status === 'SUCCESS') {
      logger.warn({
        message:
          '⚠️ Данные задачи не найдены, продолжаем с минимальными данными',
        description: 'Task data not found, continuing with minimal data',
        task_id,
      })

      // Проверяем наличие необходимых данных в результате
      if (!result || !result.sample) {
        logger.error({
          message: '❌ Некорректный результат: отсутствует sample',
          description: 'Invalid result: sample missing',
          task_id,
          result,
        })
        return res.status(500).json({ error: 'Internal server error' })
      }

      // Продолжаем выполнение с минимальными данными
      processedTaskIds.add(task_id)
      return res
        .status(200)
        .json({ message: 'Webhook processed successfully with minimal data' })
    }

    // Если данные задачи полностью отсутствуют, возвращаем ошибку
    if (!taskData) {
      logger.error({
        message: '❌ Данные задачи не найдены',
        description: 'Task data not found',
        task_id,
      })
      return res.status(500).json({ error: 'Internal server error' })
    }

    const { bot_name } = taskData
    logger.info({
      message: '🤖 Имя бота получено',
      description: 'Bot name retrieved',
      bot_name,
      task_id,
    })

    const { bot } = getBotByName(bot_name)

    if (status === 'SUCCESS') {
      if (!result?.sample) {
        logger.error({
          message: '❌ Некорректный результат: отсутствует sample',
          description: 'Invalid result: sample is missing',
          task_id,
        })
        throw new Error('Invalid result: sample is missing')
      }

      // Помечаем задачу как обработанную
      processedTaskIds.add(task_id)

      // Сохраняем фотографию на сервере
      const { telegram_id, username, bot_name, language_code, prompt } =
        await updatePrompt(task_id, result.sample)
      const is_ru = language_code === 'ru'

      logger.info({
        message: '✅ Данные промпта обновлены',
        description: 'Prompt data updated',
        task_id,
        telegram_id,
      })

      const imageLocalPath = await saveFileLocally(
        telegram_id,
        result.sample,
        'neuro-photo-v2',
        '.jpeg'
      )

      // Генерируем URL для доступа к изображению
      const imageUrl = `${API_URL}/uploads/${telegram_id}/neuro-photo-v2/${path.basename(
        imageLocalPath
      )}`

      // Сохраняем URL в базу данных
      await updatePrompt(task_id, imageUrl, 'SUCCESS')

      logger.info({
        message: '💾 Изображение сохранено',
        description: 'Image saved successfully',
        task_id,
        imageUrl,
      })

      try {
        // Отправляем изображение пользователю
        await bot.telegram.sendPhoto(
          telegram_id,
          {
            source: fs.createReadStream(imageLocalPath),
          },
          {
            reply_markup: {
              keyboard: [
                [
                  { text: '1️⃣' },
                  { text: '2️⃣' },
                  { text: '3️⃣' },
                  { text: '4️⃣' },
                ],
                [
                  { text: is_ru ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt' },
                  { text: is_ru ? '📐 Изменить размер' : '📐 Change size' },
                ],
                [{ text: is_ru ? '🏠 Главное меню' : '🏠 Main menu' }],
              ],
              resize_keyboard: true,
              one_time_keyboard: false,
            },
          }
        )

        logger.info({
          message: '📤 Изображение отправлено пользователю',
          description: 'Image sent to user',
          task_id,
          telegram_id,
        })
      } catch (sendError) {
        logger.error({
          message: '❌ Ошибка при отправке изображения пользователю',
          description: 'Error sending image to user',
          error: sendError.message,
          task_id,
          telegram_id,
        })
      }

      // Отправляем изображение в pulse
      try {
        await pulseNeuroImageV2(
          imageLocalPath,
          prompt,
          'neurophoto V2',
          telegram_id,
          username,
          is_ru
        )

        logger.info({
          message: '📊 Аналитика отправлена',
          description: 'Analytics sent',
          task_id,
          telegram_id,
        })
      } catch (pulseError) {
        logger.error({
          message: '❌ Ошибка при отправке аналитики',
          description: 'Error sending analytics',
          error: pulseError.message,
          task_id,
          telegram_id,
        })
      }

      res.status(200).json({ message: 'Webhook processed successfully' })
    } else {
      const { telegram_id, language_code } = await updatePrompt(
        task_id,
        result?.sample || ''
      )
      const is_ru = language_code === 'ru'

      logger.error({
        message: '❌ Ошибка обработки вебхука',
        description: 'Webhook processing error',
        task_id,
        status,
        telegram_id,
      })

      try {
        await bot.telegram.sendMessage(telegram_id, `🚫 ${status}`, {
          reply_markup: {
            keyboard: [
              [{ text: '1️⃣' }, { text: '2️⃣' }, { text: '3️⃣' }, { text: '4️⃣' }],
              [
                { text: is_ru ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt' },
                { text: is_ru ? '📐 Изменить размер' : '📐 Change size' },
              ],
              [{ text: is_ru ? '🏠 Главное меню' : '🏠 Main menu' }],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
          },
        })
      } catch (sendError) {
        logger.error({
          message: '❌ Ошибка при отправке сообщения об ошибке',
          description: 'Error sending error message',
          error: sendError.message,
          task_id,
          telegram_id,
        })
      }

      errorMessageAdmin(
        new Error(`🚫 Webhook received: ${JSON.stringify(req.body)}`)
      )
      res.status(200).json({ message: 'Webhook processed successfully' })
    }
  } catch (error) {
    // Логируем критическую ошибку
    logger.error({
      message: '❌ Критическая ошибка при обработке вебхука',
      description: 'Critical error processing neurophoto webhook',
      error: error.message,
      stack: error.stack,
      request: req.body,
    })

    res.status(500).json({ error: 'Internal server error' })
  }
}

// Очистка множества обработанных задач раз в сутки
setInterval(() => {
  if (processedTaskIds.size > 0) {
    processedTaskIds.clear()
    logger.info({
      message: '🧹 Очищен список обработанных задач',
      description: 'Processed tasks cleared',
      count: processedTaskIds.size,
    })
  }
}, 24 * 60 * 60 * 1000)

/**
 * Обработчик вебхука нейрофото в режиме отладки
 * Просто логирует запрос и возвращает успешный статус
 */
export const handleWebhookNeurophotoDebug = async (
  req: Request,
  res: Response
) => {
  try {
    const payload = req.body

    logger.info({
      message: '🔍 Входящий вебхук нейрофото (ОТЛАДКА)',
      description: 'Debug neurophoto webhook request',
      payload,
    })

    // Просто возвращаем успех
    return res.status(200).json({
      message: 'Webhook processed in debug mode',
      payload,
    })
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в режиме отладки вебхука нейрофото',
      description: 'Error in debug neurophoto webhook handler',
      error: error.message,
      stack: error.stack,
    })

    return res
      .status(500)
      .json({ error: 'Internal server error in debug mode' })
  }
}
