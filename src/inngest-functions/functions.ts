import { inngest } from '@/core/inngest/clients'
import { getBotByName } from '@/core/bot'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'

// Пример функции, которая реагирует на событие "test/hello.world"
export const helloWorldFunction = inngest.createFunction(
  { id: 'hello-world-handler' },
  { event: 'test/hello.world' },
  async ({ event, step }) => {
    console.log('🎉 Получено событие hello.world:', event)
    await step.sleep('подождем-секунду', '1s')

    return {
      success: true,
      message: `Привет! Обработано событие с данными: ${JSON.stringify(
        event.data
      )}`,
      processed_at: new Date().toISOString(),
    }
  }
)

// Функция для обработки массовой рассылки
export const broadcastFunction = inngest.createFunction(
  { id: 'broadcast-handler' },
  { event: 'broadcast.start' },
  async ({ event, step }) => {
    try {
      const { imageUrl, textRu, options } = event.data
      const { 
        bot_name, 
        test_mode, 
        test_telegram_id, 
        sender_telegram_id,
        contentType,
        postLink,
        videoFileId,
        textEn
      } = options || {}
      
      logger.info('🚀 Начало обработки рассылки через Inngest:', {
        description: 'Starting broadcast processing with Inngest',
        bot_name,
        test_mode: !!test_mode,
        contentType: contentType || 'photo',
      })

      // Шаг 1: Получаем пользователей
      const usersResult = await step.run('fetch-users', async () => {
        logger.info('📊 Получаем пользователей для рассылки', {
          description: 'Fetching users for broadcast',
          bot_name,
          test_mode: !!test_mode
        })
        
        let users = []
        
        if (test_mode) {
          const testId = test_telegram_id || sender_telegram_id || '144022504'
          users = bot_name
            ? [{ telegram_id: testId, bot_name, language_code: 'ru' }]
            : await supabase
                .from('users')
                .select('telegram_id, bot_name, language_code')
                .eq('telegram_id', testId)
                .then(({ data }) => data || [])
          
          logger.info(`👤 Тестовый режим: получен ${users.length} пользователь`, {
            description: 'Test mode: users fetched',
            count: users.length
          })
        } else if (bot_name) {
          const { data, error } = await supabase
            .from('users')
            .select('telegram_id, bot_name, language_code')
            .eq('bot_name', bot_name)
          
          if (error) {
            throw new Error(`Ошибка при получении пользователей: ${error.message}`)
          }
          
          users = data || []
          logger.info(`👥 Получено ${users.length} пользователей для бота ${bot_name}`, {
            description: 'Users fetched for specific bot',
            count: users.length,
            bot_name
          })
        } else {
          throw new Error('Не указан bot_name для массовой рассылки')
        }
        
        if (!users.length) {
          throw new Error('Нет пользователей для рассылки')
        }
        
        return users
      })
      
      // Шаг 2: Выполняем рассылку партиями
      const batchSize = 50 // Обрабатываем по 50 пользователей за раз
      const users = usersResult
      const totalUsers = users.length
      
      let successCount = 0
      let errorCount = 0
      
      // Разбиваем на группы для параллельной обработки
      const batches = []
      for (let i = 0; i < totalUsers; i += batchSize) {
        batches.push(users.slice(i, i + batchSize))
      }
      
      logger.info(`📦 Рассылка разбита на ${batches.length} групп по ${batchSize} пользователей`, {
        description: 'Broadcast split into batches',
        batches: batches.length,
        batchSize,
        totalUsers
      })
      
      // Обрабатываем каждую группу пользователей
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batchUsers = batches[batchIndex]
        
        const batchResults = await step.run(`process-batch-${batchIndex}`, async () => {
          logger.info(`🔄 Обработка группы ${batchIndex + 1}/${batches.length}`, {
            description: 'Processing batch',
            batchIndex: batchIndex + 1,
            totalBatches: batches.length,
            usersInBatch: batchUsers.length
          })
          
          const results = []
          
          for (const user of batchUsers) {
            if (!user.telegram_id || !user.bot_name) continue
            
            try {
              const botResult = getBotByName(user.bot_name)
              
              if (!botResult || !botResult.bot) {
                errorCount++
                results.push({
                  success: false,
                  telegram_id: user.telegram_id,
                  error: `Бот не найден: ${user.bot_name}`
                })
                continue
              }
              
              const { bot } = botResult
              
              // Отправляем сообщение в зависимости от типа контента
              if (contentType === 'post_link' && postLink) {
                const buttonText =
                  user.language_code === 'en'
                    ? '🔗 Go to post'
                    : '🔗 Перейти к посту'
                const messageText =
                  user.language_code === 'en' ? textEn || textRu : textRu

                await bot.telegram.sendMessage(
                  user.telegram_id.toString(),
                  messageText,
                  {
                    parse_mode: 'HTML',
                    link_preview_options: { is_disabled: false },
                    reply_markup: {
                      inline_keyboard: [
                        [
                          {
                            text: buttonText,
                            url: postLink,
                          },
                        ],
                      ],
                    },
                  }
                )
              } else if (contentType === 'video' && videoFileId) {
                const messageText =
                  user.language_code === 'en' ? textEn || textRu : textRu

                await bot.telegram.sendVideo(
                  user.telegram_id.toString(),
                  videoFileId,
                  {
                    caption: messageText,
                    parse_mode: 'Markdown',
                  }
                )
              } else if (imageUrl) {
                const messageText =
                  user.language_code === 'en' ? textEn || textRu : textRu

                await bot.telegram.sendPhoto(
                  user.telegram_id.toString(),
                  imageUrl,
                  {
                    caption: messageText,
                    parse_mode: 'Markdown',
                  }
                )
              } else {
                throw new Error(`Не указан контент для contentType=${contentType}`)
              }
              
              successCount++
              results.push({
                success: true,
                telegram_id: user.telegram_id,
              })
            } catch (error) {
              errorCount++
              
              // Обработка ошибок от Telegram API
              if (error.response) {
                const errorCode = error.response.error_code
                if (errorCode === 403 || errorCode === 400) {
                  // Пользователь заблокировал бота или иная критическая ошибка
                  logger.error(
                    `❌ Удаляем пользователя ${user.telegram_id} из-за ошибки ${errorCode}`,
                    {
                      description: `Removing user due to error ${errorCode}`,
                      error: error.response.description,
                      telegram_id: user.telegram_id
                    }
                  )
                  
                  try {
                    // Удаляем пользователя из базы
                    await supabase
                      .from('users')
                      .delete()
                      .eq('telegram_id', user.telegram_id)
                  } catch (dbError) {
                    logger.error('❌ Ошибка удаления пользователя из базы:', {
                      telegram_id: user.telegram_id,
                      error: dbError.message
                    })
                  }
                }
              }
              
              results.push({
                success: false,
                telegram_id: user.telegram_id,
                error: error.message || 'Неизвестная ошибка'
              })
            }
          }
          
          return results
        })
        
        logger.info(`✅ Обработана группа ${batchIndex + 1}/${batches.length}`, {
          description: 'Batch processed',
          batchIndex: batchIndex + 1,
          totalBatches: batches.length,
          successInBatch: batchResults.filter(r => r.success).length,
          errorsInBatch: batchResults.filter(r => !r.success).length
        })
      }
      
      // Финальный отчет
      const summary = {
        totalUsers,
        successCount,
        errorCount,
        bot_name,
        test_mode: !!test_mode,
        contentType: contentType || 'photo',
        completedAt: new Date().toISOString()
      }
      
      logger.info('📊 Рассылка завершена:', {
        description: 'Broadcast completed',
        ...summary
      })
      
      return summary
    } catch (error) {
      logger.error('❌ Ошибка при выполнении рассылки через Inngest:', {
        description: 'Error in Inngest broadcast function',
        error: error.message,
        stack: error.stack
      })
      
      throw error
    }
  }
)

// Экспортируем все функции для обработки
export const functions = [
  helloWorldFunction,
  broadcastFunction,
  // добавьте сюда другие функции
]
